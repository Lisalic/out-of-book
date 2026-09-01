import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RepertoireEditor } from "@/components/repertoire-editor";
import { importPgn } from "@/lib/chess/pgn";
import type { Repertoire } from "@/lib/chess/types";

function repertoireAtBranch() {
  const graph = importPgn("1. e4 e5 2. Nf3 (2. Bc4) *", "white").graph;
  const root = graph.roots[0];
  const e4 = Object.values(graph.edges).find((edge) => edge.from === root && edge.san === "e4")!;
  const e5 = Object.values(graph.edges).find((edge) => edge.from === e4.to && edge.san === "e5")!;
  const nf3 = Object.values(graph.edges).find((edge) => edge.san === "Nf3")!;
  const bc4 = Object.values(graph.edges).find((edge) => edge.san === "Bc4")!;
  const repertoire: Repertoire = {
    id: "repertoire-1",
    name: "King's Pawn",
    traineeColor: "white",
    graph,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 1,
  };
  return { repertoire, root, e4, e5, nf3, bc4 };
}

describe("RepertoireEditor keyboard branch selection", () => {
  it("picks a variation by digit key", () => {
    const { repertoire, root, e4, e5, nf3, bc4 } = repertoireAtBranch();
    const onNavigate = vi.fn();

    render(
      <RepertoireEditor
        repertoire={repertoire}
        positionId={e5.to}
        history={[root, e4.to]}
        onBack={vi.fn()}
        onNameChange={vi.fn()}
        onColorChange={vi.fn()}
        onMove={vi.fn()}
        onNavigate={onNavigate}
        onRemoveMove={vi.fn()}
        onSetMainline={vi.fn()}
        onImport={vi.fn()}
      />,
    );

    // Nf3 is the mainline (sorted first by activeEdges), Bc4 is the sideline — option 2.
    fireEvent.keyDown(window, { key: "2" });
    expect(onNavigate).toHaveBeenCalledWith(bc4.to, [root, e4.to, e5.to]);

    onNavigate.mockClear();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onNavigate).toHaveBeenCalledWith(nf3.to, [root, e4.to, e5.to]);
  });
});
