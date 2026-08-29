import { describe, expect, it } from "vitest";
import { activeEdges } from "@/lib/chess/graph";
import { importPgn } from "@/lib/chess/pgn";
import {
  advanceDrillLine,
  applyOpponentBookMove,
  beginEngineTakeover,
  createTrainingSession,
  playPendingMoveAnyway,
  retryRepertoireMove,
  revealRepertoireMove,
  submitTraineeMove,
} from "@/lib/chess/training-machine";

function setup() {
  const graph = importPgn("1. e4 e5 2. Nf3 (2. Bc4) Nc6 *", "white").graph;
  const root = graph.positions[graph.roots[0]];
  const session = createTrainingSession({
    repertoireId: "rep-1",
    traineeColor: "white",
    rootFen: root.fen,
    strength: 1400,
    deviationFrequency: "never",
    plannedDeviationPly: null,
    now: 1_000,
  });
  return { graph, session };
}

describe("training state machine", () => {
  it("accepts multiple repertoire moves and grades first try", () => {
    const { graph, session } = setup();
    const afterE4 = submitTraineeMove(session, graph, "e2e4", 2_000);
    const e5 = activeEdges(graph, afterE4.positionKey).find((edge) => edge.uci === "e7e5")!;
    const choice = applyOpponentBookMove(afterE4, graph, e5, 2_100);
    const knight = submitTraineeMove(choice, graph, "g1f3", 2_500);
    const bishop = submitTraineeMove(choice, graph, "f1c4", 2_500);
    expect(knight.attempts.at(-1)?.result).toBe("first_try");
    expect(bishop.attempts.at(-1)?.result).toBe("first_try");
  });

  it("offers a retry without calling a legal repertoire miss a blunder", () => {
    const { graph, session } = setup();
    const miss = submitTraineeMove(session, graph, "d2d4", 1_500);
    expect(miss.phase).toBe("off_repertoire");
    expect(miss.message).toContain("not in your repertoire");
    expect(miss.moves).toHaveLength(0);
    const retry = retryRepertoireMove(miss, 1_600);
    const recovered = submitTraineeMove(retry, graph, "e2e4", 2_000);
    expect(recovered.attempts[0].result).toBe("retry");
  });

  it("Show answer plays the accepted move for the trainee and grades it as revealed", () => {
    const { graph, session } = setup();
    const miss = submitTraineeMove(session, graph, "d2d4", 1_500);
    const revealed = revealRepertoireMove(miss, graph, 1_600);
    expect(revealed.moves).toHaveLength(1);
    expect(revealed.moves[0].uci).toBe("e2e4");
    expect(revealed.attempts[0]).toMatchObject({ result: "revealed", moveUci: "d2d4", expectedMoveUcis: ["e2e4"] });
    expect(revealed.phase).toBe("opponent_book_turn");
  });

  it("Play it anyway commits the trainee's off-book move and switches to a normal game", () => {
    const { graph, session } = setup();
    const miss = submitTraineeMove(session, graph, "d2d4", 1_500);
    const played = playPendingMoveAnyway(miss, graph, 1_600);
    expect(played.moves).toHaveLength(1);
    expect(played.moves[0]).toMatchObject({ uci: "d2d4", actor: "trainee", source: "trainee" });
    expect(played.takeoverReason).toBe("deviation");
    expect(played.attempts[0]).toMatchObject({ result: "revealed", moveUci: "d2d4" });
    expect(played.phase).toBe("opponent_engine_turn");
  });

  it("finishes a line in book when the saved continuation reaches a leaf", () => {
    const graph = importPgn("1. e4 e5 *", "white").graph;
    const root = graph.positions[graph.roots[0]];
    const session = createTrainingSession({ repertoireId: "rep-1", traineeColor: "white", rootFen: root.fen, strength: 1400, deviationFrequency: "low", plannedDeviationPly: null });
    const afterE4 = submitTraineeMove(session, graph, "e2e4");
    const e5 = activeEdges(graph, afterE4.positionKey)[0];
    const complete = applyOpponentBookMove(afterE4, graph, e5);
    expect(complete.phase).toBe("complete");
    expect(complete.lineCompletionReason).toBe("book_complete");
    expect(complete.takeoverReason).toBeNull();
  });

  it("continues normally after leaving book", () => {
    const { session } = setup();
    const continuation = beginEngineTakeover(session);
    const moved = submitTraineeMove(continuation, { positions: {}, edges: {}, outgoing: {}, roots: [] }, "e2e4");
    expect(moved.phase).toBe("opponent_engine_turn");
    expect(moved.takeoverReason).toBe("deviation");
  });

  it("records which position each completed line was testing, and resets the board for the next drill line", () => {
    const graph = importPgn("1. e4 e5 *", "white").graph;
    const root = graph.positions[graph.roots[0]];
    const drill = {
      lines: [
        { id: "one", targetPositionKey: root.id, edgeUcis: ["e2e4", "e7e5"] },
        { id: "two", targetPositionKey: root.id, edgeUcis: ["d2d4", "d7d5"] },
      ],
      currentLineIndex: 0,
      completedLines: [],
      deviationChance: 0.1,
    };
    const session = createTrainingSession({ repertoireId: "rep-1", traineeColor: "white", rootFen: root.fen, strength: 1400, deviationFrequency: "low", plannedDeviationPly: null, drill });
    const complete = { ...session, phase: "complete" as const, lineCompletionReason: "book_complete" as const, lineEvaluationCp: 18 };
    const next = advanceDrillLine(complete, root.fen, null, 3_000);
    expect(next.drill?.currentLineIndex).toBe(1);
    expect(next.drill?.completedLines[0]).toMatchObject({ evaluationCp: 18, targetPositionKey: root.id });
    expect(next.moves).toHaveLength(0);
    expect(next.fen).toBe(root.fen);
  });
});
