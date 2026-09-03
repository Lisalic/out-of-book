import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLiveEvaluation } from "@/components/use-live-evaluation";
import { START_FEN } from "@/lib/chess/rules";
import type { EngineFactory } from "@/components/use-engine";
import { analysis, candidate } from "./helpers/fixtures";
import { stubEngine } from "./helpers/stub-engine";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const CHECKMATE = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";

function drive(fen: string, createEngine: EngineFactory) {
  const latest = { current: { cp: undefined as number | undefined, status: "idle" as string } };
  function Harness({ position }: { position: string }) {
    latest.current = useLiveEvaluation(position, createEngine);
    return null;
  }
  const view = render(<Harness position={fen} />);
  return { latest, show: (next: string) => view.rerender(<Harness position={next} />) };
}

describe("useLiveEvaluation", () => {
  it("reports the engine's score for the position on the board, from White's side", async () => {
    const engine = stubEngine((fen) =>
      fen === START_FEN ? analysis("e2e4", [candidate("e2e4", 30)]) : analysis("e7e5", [candidate("e7e5", 40)]),
    );
    const { latest, show } = drive(START_FEN, engine.factory);
    expect(latest.current.status).toBe("evaluating");

    await waitFor(() => expect(latest.current.cp).toBe(30));
    expect(latest.current.status).toBe("idle");

    // Black to move: the same reported score means the opposite thing.
    show(AFTER_E4);
    await waitFor(() => expect(latest.current.cp).toBe(-40));
  });

  it("analyzes only the position still on the board when navigation runs ahead of the engine", async () => {
    const engine = stubEngine(() => analysis("e2e4", [candidate("e2e4", 30)]));
    const { show } = drive(START_FEN, engine.factory);
    show(AFTER_E4);
    show(START_FEN);

    await waitFor(() => expect(engine.calls.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Debounced: the positions passed through on the way are never sent to the engine.
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0].fen).toBe(START_FEN);
  });

  it("does not evaluate a finished position", async () => {
    const engine = stubEngine(() => analysis("e2e4"));
    const { latest } = drive(CHECKMATE, engine.factory);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(engine.calls).toHaveLength(0);
    expect(latest.current.status).toBe("idle");
    expect(latest.current.cp).toBeUndefined();
  });

  it("stays quiet when the engine cannot answer", async () => {
    const engine = stubEngine(() => {
      throw new Error("Engine is unavailable");
    });
    const { latest } = drive(START_FEN, engine.factory);
    await waitFor(() => expect(engine.calls).toHaveLength(1));
    expect(latest.current.cp).toBeUndefined();
  });
});
