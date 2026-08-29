import { fireEvent, render, screen } from "@testing-library/react";
import { Chess } from "chess.js";
import { describe, expect, it, vi } from "vitest";
import { HomeScreen, PracticeLibrary, RepertoireManager } from "@/components/library-screens";
import { RepertoireLine } from "@/components/repertoire-line";
import { figurineSan } from "@/lib/chess/notation";
import { importPgn } from "@/lib/chess/pgn";
import { emptyGraph, ensurePosition } from "@/lib/chess/graph";
import type { Repertoire } from "@/lib/chess/types";

function repertoire(pgn = "1. e4 e5 2. Nf3 *"): Repertoire {
  const graph = pgn ? importPgn(pgn, "white").graph : emptyGraph();
  if (!pgn) {
    const root = ensurePosition(graph, new Chess().fen(), 0).id;
    graph.roots.push(root);
  }
  return {
    id: "repertoire-1",
    name: "King's Pawn",
    traineeColor: "white",
    graph,
    createdAt: "2026-08-28T12:00:00.000Z",
    updatedAt: "2026-08-28T12:00:00.000Z",
    revision: 1,
  };
}

describe("repertoire navigation screens", () => {
  it("shows the first-run hero instead of an empty dashboard when no repertoire exists yet", () => {
    const onManage = vi.fn();
    render(
      <HomeScreen
        repertoires={[]}
        reviewStates={[]}
        onPractice={vi.fn()}
        onManage={onManage}
        onResume={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText(/KNOW THE/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import a PGN" }));
    expect(onManage).toHaveBeenCalledOnce();
  });

  it("puts starting a session and adding a repertoire at the center of the home dashboard", () => {
    const onPractice = vi.fn();
    const onManage = vi.fn();
    render(
      <HomeScreen
        repertoires={[repertoire()]}
        reviewStates={[]}
        onPractice={onPractice}
        onManage={onManage}
        onResume={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start review/i }));
    fireEvent.click(screen.getByRole("button", { name: "+ New repertoire" }));
    expect(onPractice).toHaveBeenCalledOnce();
    expect(onManage).toHaveBeenCalledOnce();
  });

  it("routes an empty repertoire to editing instead of starting an invalid drill", () => {
    const onPractice = vi.fn();
    const onEdit = vi.fn();
    render(
      <PracticeLibrary
        repertoires={[repertoire("")]}
        reviewStates={[]}
        onPractice={onPractice}
        onEdit={onEdit}
        onManage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add lines" }));
    expect(onEdit).toHaveBeenCalledWith("repertoire-1");
    expect(onPractice).not.toHaveBeenCalled();
  });

  it("keeps creation and editing available in the repertoire manager", () => {
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    render(
      <RepertoireManager
        repertoires={[repertoire()]}
        reviewStates={[]}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New book" }));
    expect(screen.getByText("King's Pawn")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith("repertoire-1");
  });
});

describe("repertoire move list", () => {
  it("shows familiar clickable plies and exposes choices when a branch is reached", () => {
    const graph = importPgn("1. e4 e5 2. Nf3 (2. Bc4) *", "white").graph;
    const root = graph.roots[0];
    const e4 = Object.values(graph.edges).find((edge) => edge.from === root && edge.san === "e4")!;
    const e5 = Object.values(graph.edges).find((edge) => edge.from === e4.to && edge.san === "e5")!;
    const bc4 = Object.values(graph.edges).find((edge) => edge.san === "Bc4")!;
    const onNavigate = vi.fn();
    const onSetMainline = vi.fn();

    render(
      <RepertoireLine
        graph={graph}
        currentId={root}
        history={[]}
        onNavigate={onNavigate}
        onRemove={vi.fn()}
        onSetMainline={onSetMainline}
      />,
    );

    expect(screen.getByRole("button", { name: "Go to e4" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to e5" })).toBeVisible();
    expect(screen.getByText("Branch reached")).toBeVisible();
    // Move text renders as a figurine glyph (♘f3), not the plain SAN letter. Nf3 is the
    // mainline answer (outside the parenthesised sideline); Bc4 is the sideline.
    const nf3Glyph = figurineSan("Nf3");
    const bc4Glyph = figurineSan("Bc4");
    expect(screen.getByRole("button", { name: nf3Glyph })).toBeVisible();
    expect(screen.getByRole("button", { name: bc4Glyph })).toBeVisible();
    expect(screen.getByText("Mainline")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Go to e4" }));
    expect(onNavigate).toHaveBeenCalledWith(e4.to, [root]);
    expect(e5.san).toBe("e5");

    // Only the sideline (Bc4) gets a "Set main" button — Nf3 already is the mainline.
    fireEvent.click(screen.getByRole("button", { name: "Set main" }));
    expect(onSetMainline).toHaveBeenCalledWith(bc4.id);
  });
});
