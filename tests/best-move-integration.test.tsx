import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparringApp } from "@/components/sparring-app";
import { TrainingScreen } from "@/components/practice-screens";
import { useTrainingEngine } from "@/components/use-training-engine";
import { importPgn } from "@/lib/chess/pgn";
import { START_FEN, playUci } from "@/lib/chess/rules";
import { createTrainingSession, retryRepertoireMove, submitTraineeMove } from "@/lib/chess/training-machine";
import type { Repertoire, TrainingSession } from "@/lib/chess/types";
import { listRepertoires, resetDatabaseHandleForTests } from "@/lib/storage/guest-store";

const { analyze, playBoardSound } = vi.hoisted(() => ({ analyze: vi.fn(), playBoardSound: vi.fn() }));
vi.mock("@/lib/chess/engine-adapter", () => ({
  BrowserLozzaAdapter: class { analyze = analyze; dispose = vi.fn(); stop = vi.fn(); },
}));
vi.mock("@/components/use-live-evaluation", () => ({ useLiveEvaluation: () => ({ status: "idle" }) }));
vi.mock("@/components/board-sound", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/board-sound")>(),
  playBoardSound,
  unlockBoardSound: vi.fn(),
}));
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { position: string; showAnimations: boolean; animationDurationInMs: number; onSquareClick: (event: { square: string }) => void } }) => (
    <div data-testid="board" data-fen={options.position} data-animations={options.showAnimations} data-duration={options.animationDurationInMs}>
      {["e2", "e4", "d2", "d4"].map((square) => <button key={square} onClick={() => options.onSquareClick({ square })}>{square}</button>)}
    </div>
  ),
}));

const repertoire: Repertoire = {
  id: "best-move-practice", name: "Best move practice", traineeColor: "white",
  graph: importPgn("1. e4 e5 2. Nf3 Nc6 *", "white").graph,
  revision: 1, createdAt: "2026-09-03", updatedAt: "2026-09-03",
};

function initialSession() {
  return createTrainingSession({ repertoireId: repertoire.id, traineeColor: "white", rootFen: START_FEN, strength: 1000, deviationFrequency: "never", plannedDeviationPly: null });
}

function Practice({ initial = initialSession() }: { initial?: TrainingSession }) {
  const [session, setSession] = useState<TrainingSession | undefined>(initial);
  const engine = useTrainingEngine(true, session, repertoire, setSession);
  return <TrainingScreen repertoire={repertoire} session={session!} engineStatus={engine.status}
    onMove={(uci) => setSession((current) => submitTraineeMove(current!, repertoire.graph, uci))}
    onRetry={() => setSession((current) => retryRepertoireMove(current!))}
    onRevealAnswer={vi.fn()} onPlayAnyway={vi.fn()} onAddToRepertoire={vi.fn()}
    onEndGame={vi.fn()} onNextLine={vi.fn()} onReview={vi.fn()} onExit={vi.fn()} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  analyze.mockResolvedValue({ bestMove: "e2e4", candidates: [] });
});

afterEach(async () => {
  cleanup();
  await resetDatabaseHandleForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("out-of-book");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe("best move integration", () => {
  it("uses the editor's existing board, sound, navigation and persistence path", async () => {
    render(<SparringApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Build on the board" }));
    const button = await screen.findByRole("button", { name: "Play best move" });
    expect(button.querySelector("path")).toHaveAttribute("fill-rule", "evenodd");
    const board = screen.getByTestId("board");
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId("board")).toHaveAttribute("data-fen", playUci(START_FEN, "e2e4").fen));
    expect(screen.getByTestId("board")).toBe(board);
    expect(board).toHaveAttribute("data-animations", "true");
    expect(board).toHaveAttribute("data-duration", "140");
    await waitFor(() => expect(playBoardSound).toHaveBeenCalledExactlyOnceWith("move"));
    expect(screen.getByText("Editing · ply 01")).toBeVisible();
    await waitFor(async () => {
      const saved = await listRepertoires();
      expect(Object.values(saved[0].graph.edges)).toEqual([expect.objectContaining({ uci: "e2e4" })]);
    });
    fireEvent.click(screen.getByRole("button", { name: "← Previous" }));
    expect(board).toHaveAttribute("data-fen", START_FEN);
  });

  it("plays an accepted practice move with the same cue and normal opponent reply", async () => {
    render(<Practice />);
    const button = screen.getByRole("button", { name: "Play best move" });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId("board")).toHaveAttribute("data-fen", playUci(START_FEN, "e2e4").fen));
    expect(button).toBeDisabled();
    expect(playBoardSound).toHaveBeenCalledExactlyOnceWith("move");
    await screen.findByRole("button", { name: "Go to e5" });
    expect(button).toBeEnabled();
    expect(analyze).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Previous move" }));
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Go to latest move" }));
    expect(button).toBeEnabled();
  });

  it("shows the normal off-book prompt and rejection sound without moving the board", async () => {
    analyze.mockResolvedValue({ bestMove: "d2d4", candidates: [] });
    render(<Practice />);
    fireEvent.click(screen.getByRole("button", { name: "Play best move" }));
    expect(await screen.findByRole("button", { name: "Play anyway" })).toBeVisible();
    expect(screen.getByTestId("board")).toHaveAttribute("data-fen", START_FEN);
    expect(playBoardSound).toHaveBeenCalledExactlyOnceWith("rejected");
    expect(screen.getByRole("button", { name: "Play best move" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("button", { name: "Play best move" })).toBeEnabled();
  });

  it("allows a manual move during analysis and discards the engine result", async () => {
    let finish!: (value: { bestMove: string; candidates: [] }) => void;
    analyze.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<Practice />);
    fireEvent.click(screen.getByRole("button", { name: "Play best move" }));
    expect(screen.getByRole("button", { name: "Play best move" })).toHaveAttribute("aria-busy", "true");
    fireEvent.click(screen.getByRole("button", { name: "d2" }));
    fireEvent.click(screen.getByRole("button", { name: "d4" }));
    await act(async () => finish({ bestMove: "e2e4", candidates: [] }));
    expect(screen.getByRole("button", { name: "Play anyway" })).toBeVisible();
    expect(screen.getByTestId("board")).toHaveAttribute("data-fen", START_FEN);
    expect(screen.queryByRole("button", { name: "Go to e4" })).not.toBeInTheDocument();
  });

  it("shows an accessible failure and allows retry", async () => {
    analyze.mockRejectedValueOnce(new Error("Engine unavailable"));
    render(<Practice />);
    fireEvent.click(screen.getByRole("button", { name: "Play best move" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
    expect(screen.getByRole("button", { name: "Play best move" })).toBeEnabled();
  });

  it("disables the action when the practice line is complete", () => {
    render(<Practice initial={{ ...initialSession(), phase: "complete", lineEvaluationCp: 0 }} />);
    expect(screen.getByRole("button", { name: "Play best move" })).toBeDisabled();
    expect(analyze).not.toHaveBeenCalled();
  });
});
