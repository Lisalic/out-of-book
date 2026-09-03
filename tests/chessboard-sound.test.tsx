import { fireEvent, render, screen } from "@testing-library/react";
import { Chess } from "chess.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chessboard } from "@/components/chessboard";

const { playBoardSound } = vi.hoisted(() => ({ playBoardSound: vi.fn() }));

vi.mock("@/components/board-sound", () => ({ playBoardSound, unlockBoardSound: vi.fn() }));
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { onSquareClick?: (event: { square: string }) => void } }) => (
    <div>
      {["e2", "d2", "e4", "e5"].map((square) => (
        <button key={square} type="button" onClick={() => options.onSquareClick?.({ square })}>{square}</button>
      ))}
    </div>
  ),
}));

beforeEach(() => playBoardSound.mockClear());

describe("chessboard sounds", () => {
  it("plays the classified cue after a one-ply FEN change", () => {
    const chess = new Chess();
    const start = chess.fen();
    chess.move("e4");
    const view = render(<Chessboard fen={start} />);

    view.rerender(<Chessboard fen={chess.fen()} />);

    expect(playBoardSound).toHaveBeenCalledExactlyOnceWith("move");
  });

  it("plays rejected only when a rejected move appears", () => {
    const fen = new Chess().fen();
    const view = render(<Chessboard fen={fen} />);

    view.rerender(<Chessboard fen={fen} rejectedMove="e2e4" />);
    view.rerender(<Chessboard fen={fen} rejectedMove="e2e4" />);

    expect(playBoardSound).toHaveBeenCalledExactlyOnceWith("rejected");
  });

  it("does not use the highlight move to sound a cyclic multi-ply jump", () => {
    const start = new Chess().fen();
    const chess = new Chess();
    ["Nf3", "Nf6", "Ng1", "Ng8", "e4"].forEach((move) => chess.move(move));
    const view = render(<Chessboard fen={start} />);

    view.rerender(<Chessboard fen={chess.fen()} lastMove="e2e4" />);

    expect(playBoardSound).not.toHaveBeenCalled();
  });

  it("distinguishes an illegal empty-square target from friendly-piece reselection", () => {
    render(<Chessboard fen={new Chess().fen()} />);

    fireEvent.click(screen.getByRole("button", { name: "e2" }));
    fireEvent.click(screen.getByRole("button", { name: "d2" }));
    expect(playBoardSound).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "e2" }));
    fireEvent.click(screen.getByRole("button", { name: "e5" }));
    expect(playBoardSound).toHaveBeenCalledExactlyOnceWith("illegal");
  });
});
