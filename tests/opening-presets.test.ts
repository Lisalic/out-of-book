import { describe, expect, it } from "vitest";
import { decisionPositions } from "@/lib/chess/scheduling";
import { importPgn } from "@/lib/chess/pgn";
import { OPENING_PRESETS, presetMovetext } from "@/lib/chess/opening-presets";

describe("opening presets", () => {
  it("provides 12 uniquely identified popular openings", () => {
    expect(OPENING_PRESETS).toHaveLength(12);
    expect(new Set(OPENING_PRESETS.map((preset) => preset.id)).size).toBe(12);
  });

  it.each(["white", "black"] as const)("builds a practiceable %s repertoire from every preset", (side) => {
    for (const preset of OPENING_PRESETS) {
      const graph = importPgn(presetMovetext(preset), side).graph;
      expect(decisionPositions(graph, side), preset.name).not.toHaveLength(0);
    }
  });

  it("derives PGN movetext from the catalog moves", () => {
    expect(presetMovetext(OPENING_PRESETS[0])).toBe(`${OPENING_PRESETS[0].moves.join(" ")} *`);
  });
});
