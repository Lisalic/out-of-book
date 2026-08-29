import { describe, expect, it } from "vitest";
import { parseEngineInfo } from "@/lib/chess/engine-adapter";

describe("Stockfish output parsing", () => {
  it("parses ordinary single-PV output without an explicit multipv field", () => {
    const parsed = parseEngineInfo("info depth 14 seldepth 20 score cp 37 nodes 12000 pv e2e4 e7e5 g1f3");
    expect(parsed?.multipv).toBe(1);
    expect(parsed?.candidate).toMatchObject({ uci: "e2e4", scoreCp: 37, depth: 14 });
  });

  it("encodes mate scores so distance-to-mate survives, closer mates scoring higher in magnitude", () => {
    const near = parseEngineInfo("info depth 18 multipv 1 score mate 2 nodes 50000 pv h5f7 g8h8 f7h7");
    const far = parseEngineInfo("info depth 18 multipv 1 score mate 5 nodes 50000 pv h5f7 g8h8 f7h7");
    expect(near?.candidate.scoreCp).toBeGreaterThan(far?.candidate.scoreCp ?? 0);
    expect(near?.candidate.scoreCp).toBeGreaterThanOrEqual(99_000);
  });

  it("parses a losing mate score as a large negative number, and explicit multipv", () => {
    const parsed = parseEngineInfo("info depth 18 multipv 2 score mate -3 nodes 50000 pv g7g6 h5e8");
    expect(parsed?.multipv).toBe(2);
    expect(parsed?.candidate.scoreCp).toBe(-(100_000 - 3));
  });

  it("ignores non-analysis messages", () => {
    expect(parseEngineInfo("readyok")).toBeNull();
  });
});
