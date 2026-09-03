import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RepertoireEditor } from "@/components/repertoire-editor";
import { importPgn } from "@/lib/chess/pgn";
import { softDeleteEdge } from "@/lib/chess/graph";
import type { Repertoire } from "@/lib/chess/types";
import { repertoireFixture } from "./helpers/fixtures";

type EditorProps = React.ComponentProps<typeof RepertoireEditor>;

function editor(overrides: Partial<EditorProps> = {}) {
  const repertoire = overrides.repertoire ?? repertoireFixture("1. e4 e5 2. Nf3 *");
  const props: EditorProps = {
    repertoire,
    positionId: repertoire.graph.roots[0],
    history: [],
    onBack: vi.fn(),
    onNameChange: vi.fn(),
    onColorChange: vi.fn(),
    onMove: vi.fn(),
    onNavigate: vi.fn(),
    onRemoveMove: vi.fn(),
    onSetMainline: vi.fn(),
    onImport: vi.fn(),
    ...overrides,
  };
  render(<RepertoireEditor {...props} />);
  return props;
}

function pasteAndPreview(pgn: string) {
  fireEvent.click(screen.getByRole("tab", { name: "Import PGN" }));
  fireEvent.change(screen.getByLabelText("PGN text"), { target: { value: pgn } });
  fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
}

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

describe("RepertoireEditor", () => {
  it("names the side to move and the ply being edited", () => {
    editor();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("white to move");
    expect(screen.getByText(/Editing · ply 00/)).toBeVisible();
  });

  it("saves a renamed book on blur, and falls back to a placeholder for an empty name", () => {
    const props = editor();
    const field = screen.getByLabelText("Repertoire name");

    fireEvent.change(field, { target: { value: "  Ruy Lopez  " } });
    fireEvent.blur(field);
    expect(props.onNameChange).toHaveBeenCalledWith("Ruy Lopez");

    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);
    expect(props.onNameChange).toHaveBeenLastCalledWith("Untitled repertoire");
  });

  it("does not save a name that has not changed", () => {
    const props = editor();
    fireEvent.blur(screen.getByLabelText("Repertoire name"));
    expect(props.onNameChange).not.toHaveBeenCalled();
  });

  it("switches the book's side", () => {
    const props = editor();
    fireEvent.click(screen.getByRole("button", { name: "black" }));
    expect(props.onColorChange).toHaveBeenCalledWith("black");
  });

  it("navigates back to the start position and out of the editor", () => {
    const repertoire = repertoireFixture("1. e4 e5 2. Nf3 *");
    const root = repertoire.graph.roots[0];
    const e4 = Object.values(repertoire.graph.edges).find((edge) => edge.san === "e4")!;
    const props = editor({ repertoire, positionId: e4.to, history: [root] });

    fireEvent.click(screen.getByRole("button", { name: "Start position" }));
    expect(props.onNavigate).toHaveBeenCalledWith(root, []);

    fireEvent.click(screen.getByRole("button", { name: "← Previous" }));
    expect(props.onNavigate).toHaveBeenLastCalledWith(root, []);

    fireEvent.click(screen.getByRole("button", { name: "← Repertoires" }));
    expect(props.onBack).toHaveBeenCalled();
  });

  it("cannot step back from the start position", () => {
    editor();
    expect(screen.getByRole("button", { name: "← Previous" })).toBeDisabled();
  });

  it("previews an import before anything is added, then commits it", () => {
    const props = editor();
    pasteAndPreview("1. e4 e5 2. Nf3 Nc6 3. Bb5 *");

    expect(screen.getByText(/moves in 1 game/)).toBeVisible();
    expect(props.onImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add to repertoire" }));
    const [graph, restoreIds] = vi.mocked(props.onImport).mock.calls[0];
    expect(Object.keys(graph.edges).length).toBeGreaterThan(4);
    expect(restoreIds.size).toBe(0);
    // Committing returns to the move list with the box cleared.
    expect(screen.getByLabelText("Repertoire move list")).toBeVisible();
  });

  it("explains a PGN it cannot read instead of importing part of it", () => {
    const props = editor();
    pasteAndPreview("1. e4 e5 2. Qz9 *");

    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent(/Game 1, ply 3/);
    expect(screen.queryByRole("button", { name: "Add to repertoire" })).toBeNull();
    expect(props.onImport).not.toHaveBeenCalled();
  });

  it("rejects a PGN that starts from a different position than this book's root", () => {
    editor();
    pasteAndPreview('[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n\n1... e5 *');
    expect(screen.getByRole("alert")).toHaveTextContent(/different position/);
  });

  it("asks before bringing back moves the user deleted on purpose", () => {
    const base = repertoireFixture("1. e4 e5 2. Nf3 *");
    const nf3 = Object.values(base.graph.edges).find((edge) => edge.san === "Nf3")!;
    const repertoire: Repertoire = { ...base, graph: softDeleteEdge(base.graph, nf3.id) };
    const props = editor({ repertoire });

    pasteAndPreview("1. e4 e5 2. Nf3 Nc6 *");
    const preview = screen.getByText(/moves in 1 game/).parentElement!;
    const restore = within(preview).getByRole("checkbox");
    expect(within(preview).getByText(/Restore 1 deleted move/)).toBeVisible();

    // Left unchecked, the deletion stands.
    fireEvent.click(screen.getByRole("button", { name: "Add to repertoire" }));
    expect(vi.mocked(props.onImport).mock.calls[0][1].size).toBe(0);

    pasteAndPreview("1. e4 e5 2. Nf3 Nc6 *");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Add to repertoire" }));
    expect(vi.mocked(props.onImport).mock.calls[1][1]).toContain(nf3.id);
    expect(restore).toBeDefined();
  });

  it("warns about a position the book answers two different ways", () => {
    editor();
    pasteAndPreview("1. e4 e5 2. Nf3 (2. Bc4) *");
    expect(screen.getByText(/multiple accepted moves/)).toBeVisible();
  });

  it("reads a PGN chosen as a file", async () => {
    editor();
    fireEvent.click(screen.getByRole("tab", { name: "Import PGN" }));
    const file = new File(["1. d4 d5 *"], "book.pgn", { type: "application/x-chess-pgn" });
    fireEvent.change(screen.getByLabelText(/Choose a PGN file/), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText("PGN text")).toHaveValue("1. d4 d5 *"));
  });

  it("says so when a chosen file cannot be read", async () => {
    editor();
    fireEvent.click(screen.getByRole("tab", { name: "Import PGN" }));
    const unreadable = new File(["1. e4 *"], "book.pgn");
    vi.spyOn(unreadable, "text").mockRejectedValue(new Error("read failed"));
    fireEvent.change(screen.getByLabelText(/Choose a PGN file/), { target: { files: [unreadable] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("That file could not be read.");
  });

  it("cannot preview an empty box", () => {
    editor();
    fireEvent.click(screen.getByRole("tab", { name: "Import PGN" }));
    expect(screen.getByRole("button", { name: "Preview import" })).toBeDisabled();
  });

  it("exports the repertoire as a PGN download", () => {
    const createObjectURL = vi.fn(() => "blob:pgn");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    editor({ repertoire: repertoireFixture("1. e4 e5 *", { name: "King's Pawn" }) });
    fireEvent.click(screen.getByRole("button", { name: "Export PGN" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pgn");
    click.mockRestore();
  });
});
