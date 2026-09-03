import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useDrillSession, type DrillSettings } from "@/components/use-drill-session";
import { initialReviewState, repertoireLines } from "@/lib/chess/scheduling";
import { submitTraineeMove } from "@/lib/chess/training-machine";
import type { Repertoire, ReviewState, TrainingSession } from "@/lib/chess/types";
import { repertoireFixture } from "./helpers/fixtures";

const SETTINGS: DrillSettings = { strength: 1400, frequency: "never", sessionSize: "all" };

interface DrillHarness {
  session?: TrainingSession;
  setSession: React.Dispatch<React.SetStateAction<TrainingSession | undefined>>;
}

/** Drives the hook over real session state, the way the training screen does. */
function renderDrill(
  repertoire: Repertoire | undefined,
  reviewStates: ReviewState[] = [],
  settings: DrillSettings = SETTINGS,
) {
  const recorded: ReviewState[][] = [];
  const harness = {} as DrillHarness;
  const view = renderHook(() => {
    const [session, setSession] = useState<TrainingSession | undefined>();
    harness.session = session;
    harness.setSession = setSession;
    return useDrillSession({
      repertoire,
      reviewStates,
      session,
      setSession,
      recordReviewStates: (states) => recorded.push(states),
      settings,
    });
  });
  return { result: view.result, recorded, harness };
}

/** An overdue schedule for the first decision of the repertoire's first line. */
function overdueState(repertoire: Repertoire, repertoireId = repertoire.id): ReviewState {
  const [line] = repertoireLines(repertoire.graph, repertoire.traineeColor);
  return {
    ...initialReviewState(repertoireId, line.decisionKeys[0], Date.parse("2026-01-01T00:00:00.000Z")),
    due: "2026-01-01T00:00:00.000Z",
  };
}

describe("useDrillSession", () => {
  it("has nothing to offer for a repertoire with no saved lines", () => {
    const { result, harness } = renderDrill(repertoireFixture(""));
    expect(result.current.lines).toEqual([]);
    expect(result.current.dueCount).toBe(0);

    let started = true;
    act(() => {
      started = result.current.start();
    });
    expect(started).toBe(false);
    expect(harness.session).toBeUndefined();
  });

  it("does nothing at all without a repertoire selected", () => {
    const { result } = renderDrill(undefined);
    expect(result.current.lines).toEqual([]);
    let started = true;
    act(() => {
      started = result.current.start();
    });
    expect(started).toBe(false);
  });

  it("starts a session over the repertoire's lines at the chosen settings", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 Nc6 3. Bb5 *");
    const { result, harness } = renderDrill(repertoire, [], { ...SETTINGS, strength: 900, frequency: "medium" });

    let started = false;
    act(() => {
      started = result.current.start();
    });

    expect(started).toBe(true);
    expect(harness.session).toMatchObject({
      repertoireId: repertoire.id,
      strength: 900,
      deviationFrequency: "medium",
      phase: "trainee_turn",
    });
    expect(harness.session?.drill?.deviationChance).toBe(0.25);
    expect(harness.session?.drill?.lines).toHaveLength(result.current.lines.length);
    expect(harness.session?.drill?.currentLineIndex).toBe(0);
  });

  it("never plans a deviation when the opponent is set to stay in book", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 Nc6 3. Bb5 *");
    const { result, harness } = renderDrill(repertoire, [], { ...SETTINGS, frequency: "never" });
    act(() => {
      result.current.start();
    });
    expect(harness.session?.drill?.deviationChance).toBe(0);
    expect(harness.session?.plannedDeviationPly).toBeNull();
  });

  it("limits a fixed-size session to that many lines", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) (3. d4 exd4) *");
    const { result, harness } = renderDrill(repertoire, [], { ...SETTINGS, sessionSize: 1 });
    expect(result.current.lines.length).toBeGreaterThan(1);

    act(() => {
      result.current.start();
    });
    expect(harness.session?.drill?.lines).toHaveLength(1);
  });

  it("counts a line as due once one of its decisions comes up for review", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    expect(renderDrill(repertoire, []).result.current.dueCount).toBe(0);
    expect(renderDrill(repertoire, [overdueState(repertoire)]).result.current.dueCount).toBe(1);
  });

  it("ignores review states belonging to a different repertoire", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const foreign = overdueState(repertoire, "someone-elses-book");
    expect(renderDrill(repertoire, [foreign]).result.current.dueCount).toBe(0);
  });

  it("grades every decision the trainee answered on the finished line", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const { result, recorded, harness } = renderDrill(repertoire);

    act(() => {
      result.current.start();
    });
    act(() => {
      harness.setSession(submitTraineeMove(harness.session!, repertoire.graph, "e2e4"));
    });
    expect(harness.session?.attempts).toHaveLength(1);

    act(() => {
      result.current.finish();
    });

    const graded = recorded.flat();
    expect(graded).toHaveLength(1);
    expect(graded[0]).toMatchObject({ repertoireId: repertoire.id, reps: 1, lapses: 0 });
    expect(graded[0].positionKey).toBe(harness.session!.attempts[0].positionKey);
  });

  it("records no grade for a line the trainee never answered", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const { result, recorded } = renderDrill(repertoire);
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.finish();
    });
    expect(recorded.flat()).toHaveLength(0);
  });

  it("moves to the next line once the current one is finished, resetting the board", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) *");
    const { result, harness } = renderDrill(repertoire);

    act(() => {
      result.current.start();
    });
    expect(harness.session!.drill!.lines.length).toBeGreaterThan(1);
    act(() => {
      harness.setSession(submitTraineeMove(harness.session!, repertoire.graph, "e2e4"));
    });
    act(() => {
      harness.setSession({ ...harness.session!, phase: "complete", lineCompletionReason: "book_complete" });
    });

    let outcome: "next_line" | "review" = "review";
    act(() => {
      outcome = result.current.advance();
    });

    expect(outcome).toBe("next_line");
    expect(harness.session?.drill?.currentLineIndex).toBe(1);
    expect(harness.session?.drill?.completedLines).toHaveLength(1);
    // The board is back at the root for the new line, but the session id carries over.
    expect(harness.session?.moves).toEqual([]);
    expect(harness.session?.phase).toBe("trainee_turn");
  });

  it("stays on the current line while it is still being played", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) *");
    const { result, harness } = renderDrill(repertoire);

    act(() => {
      result.current.start();
    });
    act(() => {
      harness.setSession(submitTraineeMove(harness.session!, repertoire.graph, "e2e4"));
    });
    act(() => {
      result.current.advance();
    });

    // The line was never finished, so the drill does not skip past it.
    expect(harness.session?.drill?.currentLineIndex).toBe(0);
    expect(harness.session?.moves).toHaveLength(1);
  });

  it("closes the session into review once the last line is done", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const { result, harness } = renderDrill(repertoire);
    act(() => {
      result.current.start();
    });
    expect(harness.session!.drill!.lines).toHaveLength(1);
    act(() => {
      harness.setSession({ ...harness.session!, phase: "complete", lineCompletionReason: "book_complete" });
    });

    let outcome: "next_line" | "review" = "next_line";
    act(() => {
      outcome = result.current.advance();
    });

    expect(outcome).toBe("review");
    expect(harness.session?.phase).toBe("review");
    expect(harness.session?.drill?.completedLines).toHaveLength(1);
  });

  it("grades and closes a session the trainee ends early", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) *");
    const { result, harness } = renderDrill(repertoire);
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.finish();
    });
    expect(harness.session?.phase).toBe("review");
    expect(harness.session?.drill?.completedLines).toHaveLength(1);
  });
});
