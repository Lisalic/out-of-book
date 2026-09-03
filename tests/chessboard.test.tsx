import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chessboard } from "@/components/chessboard";
import { START_FEN } from "@/lib/chess/rules";

const PROMOTION_FEN = "8/P7/8/8/8/8/7p/4K2k w - - 0 1";

function board(props: Partial<React.ComponentProps<typeof Chessboard>> = {}) {
  const onMove = vi.fn();
  const view = render(<Chessboard fen={START_FEN} onMove={onMove} {...props} />);
  const square = (name: string) => {
    const element = view.container.querySelector(`[data-square="${name}"]`);
    if (!element) throw new Error(`No square ${name} on the board`);
    return element;
  };
  /** Per-square highlights land on the square's inner content div, not the square itself. */
  const squareStyle = (name: string) => square(name).querySelector(":scope > div")?.getAttribute("style") ?? "";
  return { ...view, onMove, square, squareStyle, click: (name: string) => fireEvent.click(square(name)) };
}

describe("Chessboard", () => {
  it("plays a move from two clicks: pick the piece, then the destination", () => {
    const { onMove, click } = board();
    click("e2");
    click("e4");
    expect(onMove).toHaveBeenCalledWith("e2e4");
  });

  it("switches the selection to another of your own pieces instead of playing an illegal move", () => {
    const { onMove, click } = board();
    click("e2");
    click("d2");
    expect(onMove).not.toHaveBeenCalled();

    click("d4");
    expect(onMove).toHaveBeenCalledWith("d2d4");
  });

  it("ignores clicks on the opponent's pieces and empty squares", () => {
    const { onMove, click } = board();
    click("e7");
    click("e5");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not accept moves at all when the board is only being shown", () => {
    const { onMove, click } = board({ interactive: false });
    click("e2");
    click("e4");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("asks which piece to promote to rather than assuming a queen", () => {
    const { onMove, click } = board({ fen: PROMOTION_FEN });
    click("a7");
    click("a8");

    expect(onMove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Choose promotion piece" });
    expect(dialog).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Rook/ }));
    expect(onMove).toHaveBeenCalledWith("a7a8r");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers every promotion piece, and lets the trainee back out", () => {
    const { onMove, click } = board({ fen: PROMOTION_FEN });
    click("a7");
    click("a8");

    ["Queen", "Rook", "Bishop", "Knight"].forEach((piece) => {
      expect(screen.getByRole("button", { name: new RegExp(piece) })).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("announces the position for screen readers", () => {
    board();
    expect(screen.getByText("White to move. 20 legal moves.")).toBeVisible();
  });

  it("marks both squares of the last move, and leaves the rest of the board plain", () => {
    const { squareStyle } = board({ lastMove: "e2e4" });
    expect(squareStyle("e2")).toContain("background-color");
    expect(squareStyle("e4")).toContain("background-color");
    expect(squareStyle("a1")).not.toContain("background-color");
  });

  it("flags a rejected move on the board without playing it", () => {
    const { squareStyle } = board({ fen: START_FEN, rejectedMove: "d2d4" });
    expect(squareStyle("d2")).toContain("box-shadow");
    expect(squareStyle("d4")).toContain("box-shadow");
    // The position itself is untouched — d2 still holds the pawn.
    expect(screen.getByText("White to move. 20 legal moves.")).toBeVisible();
  });

  it("outlines the king that is in check", () => {
    const inCheck = "rnbqkbnr/ppp2ppp/8/1B1pp3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 3";
    const { squareStyle } = board({ fen: inCheck });
    expect(squareStyle("e8")).toContain("box-shadow");
    expect(squareStyle("e1")).not.toContain("box-shadow");
  });

  it("shows where a selected piece can go", () => {
    const { squareStyle, click } = board();
    click("e2");
    expect(squareStyle("e2")).toContain("background-color");
    expect(squareStyle("e4")).toContain("radial-gradient");
    expect(squareStyle("e5")).not.toContain("radial-gradient");
  });
});
