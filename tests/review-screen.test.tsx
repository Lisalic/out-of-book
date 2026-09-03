import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewScreen } from "@/components/review-screen";
import { initialReviewState } from "@/lib/chess/scheduling";
import { createTrainingSession } from "@/lib/chess/training-machine";
import { START_FEN } from "@/lib/chess/rules";
import type { DrillLineResult, RecallAttempt, ReviewState, TrainingSession } from "@/lib/chess/types";

const REPERTOIRE_ID = "rep-review";

function attempt(result: RecallAttempt["result"], positionKey = "pos-1"): RecallAttempt {
  return { positionKey, moveUci: "e2e4", expectedMoveUcis: ["e2e4"], result, responseMs: 1200 };
}

function line(overrides: Partial<DrillLineResult> = {}): DrillLineResult {
  return {
    lineIndex: 0,
    decisionKeys: ["pos-1"],
    completionReason: "book_complete",
    leftBook: false,
    finalFen: START_FEN,
    evaluationCp: 40,
    moves: [],
    attempts: [attempt("first_try")],
    ...overrides,
  };
}

function sessionWith(lines: DrillLineResult[]): TrainingSession {
  const base = createTrainingSession({
    repertoireId: REPERTOIRE_ID,
    traineeColor: "white",
    rootFen: START_FEN,
    strength: 1400,
    deviationFrequency: "never",
    plannedDeviationPly: null,
    drill: { lines: [], currentLineIndex: lines.length, completedLines: lines, deviationChance: 0 },
  });
  return { ...base, phase: "review" };
}

function show(lines: DrillLineResult[], reviewStates: ReviewState[] = []) {
  const props = { session: sessionWith(lines), reviewStates, onDone: vi.fn(), onAgain: vi.fn() };
  render(<ReviewScreen {...props} />);
  return props;
}

describe("ReviewScreen", () => {
  it("leads with how many decisions were answered first try", () => {
    show([
      line({ lineIndex: 0, attempts: [attempt("first_try"), attempt("retry", "pos-2")] }),
      line({ lineIndex: 1, attempts: [attempt("first_try", "pos-3")] }),
    ]);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2 OF 3, FIRST TRY.");
    // The percentage and its sign are separate nodes, so read the whole Recall panel.
    expect(screen.getByText("Recall").parentElement).toHaveTextContent("67%");
    expect(screen.getByText("2 first try · 1 corrected · 0 revealed")).toBeVisible();
  });

  it("counts a revealed answer against recall", () => {
    show([line({ attempts: [attempt("revealed")] })]);
    expect(screen.getByText("Recall").parentElement).toHaveTextContent("0%");
    expect(screen.getByText("0 first try · 0 corrected · 1 revealed")).toBeVisible();
  });

  it("averages the evaluation across the lines that were scored", () => {
    show([
      line({ lineIndex: 0, evaluationCp: 100 }),
      line({ lineIndex: 1, evaluationCp: 200 }),
      line({ lineIndex: 2, evaluationCp: null }),
    ]);
    const panel = screen.getByText("Evaluation").parentElement!;
    expect(within(panel).getByText("+1.5")).toBeVisible();
  });

  it("shows no average at all when nothing could be evaluated", () => {
    show([line({ evaluationCp: null })]);
    const panel = screen.getByText("Evaluation").parentElement!;
    expect(within(panel).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("labels each line by how it finished", () => {
    show([
      line({ lineIndex: 0, completionReason: "book_complete", leftBook: false }),
      line({ lineIndex: 1, completionReason: "user_ended", leftBook: true }),
      line({ lineIndex: 2, completionReason: "checkmate", leftBook: true }),
    ]);

    expect(screen.getByText("In book")).toBeVisible();
    expect(screen.getByText("Sparred")).toBeVisible();
    expect(screen.getByText("Checkmate")).toBeVisible();
  });

  it("reports when a line's evaluation was unavailable rather than showing a zero", () => {
    show([line({ evaluationCp: null })]);
    expect(screen.getByText("Unavailable")).toBeVisible();
  });

  it("tells the trainee when each line comes back, using its soonest decision", () => {
    const soon = { ...initialReviewState(REPERTOIRE_ID, "pos-1"), due: new Date(Date.now() + 86_400_000).toISOString() };
    const later = { ...initialReviewState(REPERTOIRE_ID, "pos-2"), due: new Date(Date.now() + 12 * 86_400_000).toISOString() };
    show([line({ decisionKeys: ["pos-2", "pos-1"] })], [later, soon]);
    expect(screen.getByText("Tomorrow")).toBeVisible();
  });

  it("ignores review state that belongs to another repertoire", () => {
    const foreign = { ...initialReviewState("other-book", "pos-1"), due: new Date(Date.now() + 86_400_000).toISOString() };
    show([line()], [foreign]);
    expect(screen.queryByText("Tomorrow")).toBeNull();
  });

  it("falls back to the live session's attempts when no line was recorded", () => {
    const props = { session: { ...sessionWith([]), attempts: [attempt("first_try")] }, reviewStates: [], onDone: vi.fn(), onAgain: vi.fn() };
    render(<ReviewScreen {...props} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("1 OF 1, FIRST TRY.");
  });

  it("offers both ways out of the review", () => {
    const props = show([line()]);
    fireEvent.click(screen.getByRole("button", { name: "Back to today" }));
    expect(props.onDone).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Practise again" }));
    expect(props.onAgain).toHaveBeenCalled();
  });
});
