import { render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useTrainingEngine } from "@/components/use-training-engine";
import { createTrainingSession, submitTraineeMove } from "@/lib/chess/training-machine";
import type { EngineFactory } from "@/components/use-engine";
import type { Repertoire, TrainingSession } from "@/lib/chess/types";
import { analysis, candidate, repertoireFixture } from "./helpers/fixtures";
import { stubEngine } from "./helpers/stub-engine";

function rootFen(repertoire: Repertoire): string {
  return repertoire.graph.positions[repertoire.graph.roots[0]].fen;
}

function newSession(repertoire: Repertoire, overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    ...createTrainingSession({
      repertoireId: repertoire.id,
      traineeColor: repertoire.traineeColor,
      rootFen: rootFen(repertoire),
      strength: 1400,
      deviationFrequency: "never",
      plannedDeviationPly: null,
    }),
    ...overrides,
  };
}

/** Renders the hook over real session state, the way the training screen drives it. */
function drive(initial: TrainingSession, repertoire: Repertoire, createEngine: EngineFactory) {
  const latest = { current: initial };
  function Harness() {
    const [session, setSession] = useState<TrainingSession | undefined>(initial);
    latest.current = session ?? initial;
    useTrainingEngine(true, session, repertoire, setSession, createEngine);
    return null;
  }
  render(<Harness />);
  return latest;
}

describe("useTrainingEngine", () => {
  it("replays the opponent's saved reply from the book without consulting the engine", async () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const engine = stubEngine(() => analysis("a2a3"));
    const opponentToMove = submitTraineeMove(newSession(repertoire), repertoire.graph, "e2e4");
    expect(opponentToMove.phase).toBe("opponent_book_turn");

    const session = drive(opponentToMove, repertoire, engine.factory);
    await waitFor(() => expect(session.current.moves).toHaveLength(2));

    const reply = session.current.moves[1];
    expect(reply).toMatchObject({ san: "e5", actor: "opponent", source: "book" });
    expect(session.current.phase).toBe("trainee_turn");
    expect(session.current.takeoverReason).toBeNull();
    expect(engine.calls).toHaveLength(0);
  });

  it("leaves the book at the planned ply, playing an engine move the repertoire does not cover", async () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const engine = stubEngine(() => analysis("c7c5", [candidate("e7e5", 30), candidate("c7c5", 15)]));
    const planned = submitTraineeMove(
      newSession(repertoire, { plannedDeviationPly: 1 }),
      repertoire.graph,
      "e2e4",
    );

    const session = drive(planned, repertoire, engine.factory);
    await waitFor(() => expect(session.current.moves).toHaveLength(2));

    expect(session.current.moves[1]).toMatchObject({ uci: "c7c5", source: "engine" });
    expect(session.current.takeoverReason).toBe("deviation");
    expect(session.current.actualDeviationPly).toBe(1);
    expect(session.current.phase).toBe("continuation");
    // A deviation search asks for more candidates than an ordinary reply, so there is
    // something other than the book move to choose from.
    expect(engine.calls[0].options.multiPv).toBe(6);
  });

  it("plays on with a legal move when the engine fails, rather than stalling the drill", async () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const engine = stubEngine(() => {
      throw new Error("Engine worker failed");
    });
    const planned = submitTraineeMove(
      newSession(repertoire, { plannedDeviationPly: 1 }),
      repertoire.graph,
      "e2e4",
    );

    const session = drive(planned, repertoire, engine.factory);
    await waitFor(() => expect(session.current.moves).toHaveLength(2));

    const reply = session.current.moves[1];
    expect(reply.actor).toBe("opponent");
    // The book move was excluded, so the drill genuinely left the repertoire.
    expect(reply.uci).not.toBe("e7e5");
    expect(session.current.takeoverReason).toBe("deviation");
  });

  it("ignores a cancelled search instead of treating it as an engine failure", async () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const engine = stubEngine(() => {
      throw new DOMException("Search replaced", "AbortError");
    });
    const planned = submitTraineeMove(
      newSession(repertoire, { plannedDeviationPly: 1 }),
      repertoire.graph,
      "e2e4",
    );

    const session = drive(planned, repertoire, engine.factory);
    await waitFor(() => expect(engine.calls).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(session.current.moves).toHaveLength(1);
  });

  it("scores a finished line from White's point of view once, and stops asking", async () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const engine = stubEngine(() => analysis("g1f3", [candidate("g1f3", 64)]));
    const finished = newSession(repertoire, { phase: "complete", lineCompletionReason: "book_complete" });

    const session = drive(finished, repertoire, engine.factory);
    await waitFor(() => expect(session.current.lineEvaluationCp).toBe(64));
    expect(engine.calls[0].options.multiPv).toBe(1);
    expect(engine.calls).toHaveLength(1);
  });

  it("records an unavailable evaluation rather than leaving the line waiting forever", async () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const engine = stubEngine(() => {
      throw new Error("Engine search timed out");
    });
    const finished = newSession(repertoire, { phase: "complete", lineCompletionReason: "book_complete" });

    const session = drive(finished, repertoire, engine.factory);
    await waitFor(() => expect(session.current.lineEvaluationCp).toBeNull());
  });

  it("does not evaluate a checkmate — the result is already known", async () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const engine = stubEngine(() => analysis("g1f3"));
    const mated = newSession(repertoire, { phase: "complete", lineCompletionReason: "checkmate" });

    drive(mated, repertoire, engine.factory);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(engine.calls).toHaveLength(0);
  });
});
