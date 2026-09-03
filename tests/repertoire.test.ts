import { describe, expect, it } from "vitest";
import { activeEdges } from "@/lib/chess/graph";
import { importPgn } from "@/lib/chess/pgn";
import { fenTurn } from "@/lib/chess/position-key";
import { createRepertoire, reviseRepertoire, withTraineeColor } from "@/lib/chess/repertoire";
import { START_FEN } from "@/lib/chess/rules";
import { repertoireFixture } from "./helpers/fixtures";

describe("createRepertoire", () => {
  it("starts from the standard position with a single root and no moves", () => {
    const created = createRepertoire({ now: Date.parse("2026-09-01T10:00:00.000Z") });
    expect(created.graph.roots).toHaveLength(1);
    expect(created.graph.positions[created.graph.roots[0]].fen).toBe(START_FEN);
    expect(Object.keys(created.graph.edges)).toHaveLength(0);
    expect(created.revision).toBe(1);
    expect(created.createdAt).toBe("2026-09-01T10:00:00.000Z");
    expect(created.updatedAt).toBe(created.createdAt);
    expect(created.traineeColor).toBe("white");
  });

  it("accepts a name, a side, and a non-standard starting position", () => {
    const fen = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
    const created = createRepertoire({ name: "Sicilian", traineeColor: "black", rootFen: fen });
    expect(created.name).toBe("Sicilian");
    expect(created.traineeColor).toBe("black");
    expect(created.graph.positions[created.graph.roots[0]].fen).toBe(fen);
  });

  it("gives each repertoire its own id", () => {
    expect(createRepertoire().id).not.toBe(createRepertoire().id);
  });
});

describe("reviseRepertoire", () => {
  it("bumps the revision and updatedAt on every edit, leaving the original untouched", () => {
    const original = repertoireFixture();
    const renamed = reviseRepertoire(original, { name: "Ruy Lopez" }, Date.parse("2026-09-01T10:00:00.000Z"));
    expect(renamed.name).toBe("Ruy Lopez");
    expect(renamed.revision).toBe(original.revision + 1);
    expect(renamed.updatedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(renamed.createdAt).toBe(original.createdAt);
    expect(renamed.id).toBe(original.id);
    expect(original.name).toBe("King's Pawn");
    expect(original.revision).toBe(1);
  });

  it("bumps the revision even when the change set is empty, so a write is never mistaken for a stale copy", () => {
    const original = repertoireFixture();
    expect(reviseRepertoire(original, {}).revision).toBe(2);
  });
});

describe("withTraineeColor", () => {
  it("re-labels accepted moves by whose turn it is, not by who owned them before", () => {
    const asWhite = importPgn("1. e4 e5 2. Nf3 Nc6 *", "white").graph;
    const accepted = (graph: typeof asWhite) =>
      Object.values(graph.edges).filter((edge) => edge.isAccepted).map((edge) => edge.san).sort();

    expect(accepted(asWhite)).toEqual(["Nf3", "e4"]);
    const asBlack = withTraineeColor(asWhite, "black");
    expect(accepted(asBlack)).toEqual(["Nc6", "e5"]);

    // Every accepted edge leaves a position where it really is the trainee's move.
    Object.values(asBlack.edges)
      .filter((edge) => edge.isAccepted)
      .forEach((edge) => expect(fenTurn(asBlack.positions[edge.from].fen)).toBe("black"));
  });

  it("is reversible and leaves the move structure alone", () => {
    const asWhite = importPgn("1. e4 e5 2. Nf3 Nc6 *", "white").graph;
    const roundTripped = withTraineeColor(withTraineeColor(asWhite, "black"), "white");
    expect(roundTripped).toEqual(asWhite);
    expect(activeEdges(roundTripped, roundTripped.roots[0]).map((edge) => edge.san)).toEqual(["e4"]);
  });
});
