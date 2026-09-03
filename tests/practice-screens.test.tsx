import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PracticeSetup, TrainingScreen } from "@/components/practice-screens";
import { createTrainingSession, submitTraineeMove } from "@/lib/chess/training-machine";
import type { Repertoire, TrainingSession } from "@/lib/chess/types";
import { repertoireFixture } from "./helpers/fixtures";

function setup(overrides: Partial<React.ComponentProps<typeof PracticeSetup>> = {}) {
  const props = {
    repertoire: repertoireFixture(),
    strength: 1400,
    frequency: "low" as const,
    sessionSize: 20 as number | "all",
    lineCount: 12,
    dueCount: 3,
    onBack: vi.fn(),
    onStrengthChange: vi.fn(),
    onFrequencyChange: vi.fn(),
    onSessionSizeChange: vi.fn(),
    onStart: vi.fn(),
    ...overrides,
  };
  render(<PracticeSetup {...props} />);
  return props;
}

function session(repertoire: Repertoire, overrides: Partial<TrainingSession> = {}): TrainingSession {
  const base = createTrainingSession({
    repertoireId: repertoire.id,
    traineeColor: repertoire.traineeColor,
    rootFen: repertoire.graph.positions[repertoire.graph.roots[0]].fen,
    strength: 1400,
    deviationFrequency: "never",
    plannedDeviationPly: null,
    drill: { lines: [{ id: "line-1", decisionKeys: [], edgeUcis: [] }], currentLineIndex: 0, completedLines: [], deviationChance: 0 },
  });
  return { ...base, ...overrides };
}

function training(overrides: Partial<React.ComponentProps<typeof TrainingScreen>> = {}) {
  const repertoire = (overrides.repertoire as Repertoire) ?? repertoireFixture();
  const props = {
    repertoire,
    session: session(repertoire),
    engineStatus: "idle" as const,
    onMove: vi.fn(),
    onRetry: vi.fn(),
    onRevealAnswer: vi.fn(),
    onPlayAnyway: vi.fn(),
    onAddToRepertoire: vi.fn(),
    onEndGame: vi.fn(),
    onNextLine: vi.fn(),
    onReview: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  render(<TrainingScreen {...props} />);
  return props;
}

describe("PracticeSetup", () => {
  it("shows what the session will cover before it starts", () => {
    setup({ dueCount: 3, lineCount: 12 });
    expect(screen.getByText("Lines due today").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Lines in book").nextElementSibling).toHaveTextContent("12");
    expect(screen.getByText("Playing as").nextElementSibling).toHaveTextContent("white");
  });

  it("reports the opponent strength as a rating and a tier", () => {
    setup({ strength: 800 });
    expect(screen.getByText("≈800 · beginner")).toBeVisible();
  });

  it("changes strength from the slider and from the tier shortcuts", () => {
    const props = setup({ strength: 1400 });
    fireEvent.change(screen.getByLabelText("Opponent strength"), { target: { value: "1700" } });
    expect(props.onStrengthChange).toHaveBeenCalledWith(1700);

    fireEvent.click(screen.getByRole("button", { name: /Strong/ }));
    expect(props.onStrengthChange).toHaveBeenLastCalledWith(2000);
  });

  it("offers each leaves-book frequency with the odds it actually uses", () => {
    const props = setup();
    expect(screen.getByRole("button", { name: /Occasionally/ })).toHaveTextContent("10%");
    expect(screen.getByRole("button", { name: /Sometimes/ })).toHaveTextContent("25%");
    expect(screen.getByRole("button", { name: /Often/ })).toHaveTextContent("50%");
    expect(screen.getByRole("button", { name: /Never/ })).toHaveTextContent("0%");

    fireEvent.click(screen.getByRole("button", { name: /Sometimes/ }));
    expect(props.onFrequencyChange).toHaveBeenCalledWith("medium");
  });

  it("treats the top of the session-size slider as 'every due line'", () => {
    const props = setup({ lineCount: 8, sessionSize: 4 });
    const slider = screen.getByLabelText("Lines this session");
    expect(slider).toHaveValue("4");

    fireEvent.change(slider, { target: { value: "8" } });
    expect(props.onSessionSizeChange).toHaveBeenCalledWith("all");

    fireEvent.change(slider, { target: { value: "5" } });
    expect(props.onSessionSizeChange).toHaveBeenLastCalledWith(5);
  });

  it("cannot start a session for a repertoire with no lines", () => {
    setup({ lineCount: 0 });
    expect(screen.getByRole("button", { name: /Start session/ })).toBeDisabled();
  });

  it("starts the session and goes back on request", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /Start session/ }));
    expect(props.onStart).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Back to books/ }));
    expect(props.onBack).toHaveBeenCalled();
  });
});

describe("TrainingScreen", () => {
  it("names the book, the side, and how far through the session the trainee is", () => {
    const repertoire = repertoireFixture();
    training({ repertoire });
    expect(screen.getByText(`${repertoire.name} — white`)).toBeVisible();
    expect(screen.getByText("Line 1/1")).toBeVisible();
  });

  it("says whose move it is", () => {
    training({ engineStatus: "idle" });
    expect(screen.getByText("Your move")).toBeVisible();
  });

  it("says when the opponent is thinking", () => {
    training({ engineStatus: "thinking" });
    expect(screen.getByText("Opponent thinking…")).toBeVisible();
  });

  it("shows the played moves as a clickable list", () => {
    const repertoire = repertoireFixture();
    const played = submitTraineeMove(session(repertoire), repertoire.graph, "e2e4");
    training({ repertoire, session: played });

    const moves = screen.getByRole("button", { name: "Go to e4" });
    expect(moves).toBeVisible();
    fireEvent.click(moves);
  });

  it("offers the coach card's four choices after an off-book move, alongside the saved answer", () => {
    const repertoire = repertoireFixture();
    const offBook = submitTraineeMove(session(repertoire), repertoire.graph, "d2d4");
    expect(offBook.phase).toBe("off_repertoire");

    const props = training({ repertoire, session: offBook });
    expect(screen.getByText("Off book")).toBeVisible();
    // The book's own answer is shown as a figurine, not as raw SAN.
    expect(within(screen.getByText("Your book said").parentElement!).getByText("e4")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(props.onRetry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(props.onRevealAnswer).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play anyway" }));
    expect(props.onPlayAnyway).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "+ Add this move" }));
    expect(props.onAddToRepertoire).toHaveBeenCalled();
  });

  it("holds the final score back until the engine has finished evaluating", () => {
    const repertoire = repertoireFixture();
    const finished = session(repertoire, { phase: "complete", lineCompletionReason: "book_complete" });

    training({ repertoire, session: finished, engineStatus: "evaluating" });

    expect(screen.getByText("Line complete")).toBeVisible();
    expect(screen.getByText("…")).toBeVisible();
    // No primary action yet — moving on before the score lands would lose it.
    expect(screen.queryByRole("button", { name: "Review session" })).toBeNull();
  });

  it("shows the evaluation and the way on once the line is scored", () => {
    const repertoire = repertoireFixture();
    const finished = session(repertoire, {
      phase: "complete",
      lineCompletionReason: "book_complete",
      lineEvaluationCp: 140,
    });
    const props = training({ repertoire, session: finished });

    // The eval bar carries the same number as a hover label, so read the scoreboard panel.
    const panel = screen.getByText("Final evaluation").parentElement!;
    expect(within(panel).getByText("+1.4")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Review session" }));
    expect(props.onReview).toHaveBeenCalled();
  });

  it("offers the next line rather than the review while lines remain", () => {
    const repertoire = repertoireFixture();
    const multiLine = session(repertoire, {
      phase: "complete",
      lineCompletionReason: "book_complete",
      lineEvaluationCp: 0,
    });
    multiLine.drill = {
      lines: [
        { id: "line-1", decisionKeys: [], edgeUcis: [] },
        { id: "line-2", decisionKeys: [], edgeUcis: [] },
      ],
      currentLineIndex: 0,
      completedLines: [],
      deviationChance: 0,
    };
    const props = training({ repertoire, session: multiLine });

    fireEvent.click(screen.getByRole("button", { name: "Next line" }));
    expect(props.onNextLine).toHaveBeenCalled();
    expect(props.onReview).not.toHaveBeenCalled();
  });

  it("shows a checkmate as the result instead of a centipawn score", () => {
    const repertoire = repertoireFixture();
    const mated = session(repertoire, { phase: "complete", lineCompletionReason: "checkmate", message: "White won by checkmate" });
    training({ repertoire, session: mated });
    expect(screen.getByText("Checkmate")).toBeVisible();
  });

  it("lets the trainee end a sparred game and leave the session", () => {
    const repertoire = repertoireFixture();
    const sparring = session(repertoire, { takeoverReason: "deviation", phase: "continuation" });
    const props = training({ repertoire, session: sparring });

    expect(screen.getByText("Out of book")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    expect(props.onEndGame).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Save & exit/ }));
    expect(props.onExit).toHaveBeenCalled();
  });
});
