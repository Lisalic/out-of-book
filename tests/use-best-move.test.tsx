import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBestMove } from "@/components/use-best-move";
import { START_FEN, playUci } from "@/lib/chess/rules";
import type { EngineAnalysis } from "@/lib/chess/engine-adapter";

const { analyze, dispose, unlockBoardSound } = vi.hoisted(() => ({
  analyze: vi.fn(), dispose: vi.fn(), unlockBoardSound: vi.fn(),
}));
vi.mock("@/lib/chess/engine-adapter", () => ({
  BrowserLozzaAdapter: class { analyze = analyze; dispose = dispose; },
}));
vi.mock("@/components/board-sound", () => ({ unlockBoardSound }));

function deferred() {
  let resolve!: (result: EngineAnalysis) => void;
  const promise = new Promise<EngineAnalysis>((done) => { resolve = done; });
  return { promise, resolve: (bestMove = "e2e4") => resolve({ bestMove, candidates: [] }) };
}

beforeEach(() => vi.clearAllMocks());

describe("useBestMove", () => {
  it("searches only on click and synchronously rejects duplicate requests", async () => {
    const request = deferred();
    analyze.mockReturnValue(request.promise);
    const onMove = vi.fn();
    const { result } = renderHook(() => useBestMove({ fen: START_FEN, contextKey: "editor", onMove }));
    expect(analyze).not.toHaveBeenCalled();
    act(() => { void result.current.play(); void result.current.play(); });
    expect(unlockBoardSound).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledExactlyOnceWith(START_FEN, { multiPv: 1, moveTimeMs: 500 });
    expect(result.current).toMatchObject({ thinking: true, disabled: true });
    await act(async () => request.resolve());
    expect(onMove).toHaveBeenCalledExactlyOnceWith("e2e4");
    expect(result.current.thinking).toBe(false);
    expect(dispose).toHaveBeenCalled();
  });

  it.each([
    { fen: playUci(START_FEN, "d2d4").fen, contextKey: "start", enabled: true },
    { fen: START_FEN, contextKey: "another-session-or-history", enabled: true },
    { fen: START_FEN, contextKey: "start", enabled: false },
  ])("discards a pending result when context changes to %j", async (next) => {
    const request = deferred();
    analyze.mockReturnValue(request.promise);
    const onMove = vi.fn();
    const { result, rerender } = renderHook((props) => useBestMove({ ...props, onMove }), {
      initialProps: { fen: START_FEN, contextKey: "start", enabled: true },
    });
    act(() => { void result.current.play(); });
    rerender(next);
    expect(dispose).toHaveBeenCalled();
    await act(async () => request.resolve());
    expect(onMove).not.toHaveBeenCalled();
    expect(result.current.error).toBeUndefined();
  });

  it("does not revive an old search when navigating away and back to the same FEN", async () => {
    const old = deferred();
    const current = deferred();
    analyze.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const onMove = vi.fn();
    const { result, rerender } = renderHook(({ contextKey }) => useBestMove({ fen: START_FEN, contextKey, onMove }), {
      initialProps: { contextKey: "original" },
    });
    act(() => { void result.current.play(); });
    rerender({ contextKey: "other" });
    rerender({ contextKey: "original" });
    act(() => { void result.current.play(); });
    await act(async () => old.resolve());
    expect(onMove).not.toHaveBeenCalled();
    expect(result.current.thinking).toBe(true);
    await act(async () => current.resolve("d2d4"));
    expect(onMove).toHaveBeenCalledExactlyOnceWith("d2d4");
  });

  it("disposes pending work on unmount without submitting the eventual result", async () => {
    const request = deferred();
    analyze.mockReturnValue(request.promise);
    const onMove = vi.fn();
    const { result, unmount } = renderHook(() => useBestMove({ fen: START_FEN, contextKey: "start", onMove }));
    act(() => { void result.current.play(); });
    unmount();
    expect(dispose).toHaveBeenCalled();
    await act(async () => request.resolve());
    expect(onMove).not.toHaveBeenCalled();
  });

  it.each(["failure", "illegal move"])("reports %s and permits retry without a fallback", async (failure) => {
    if (failure === "failure") analyze.mockRejectedValueOnce(new Error("Worker failed"));
    else analyze.mockResolvedValueOnce({ bestMove: "e2e5", candidates: [] });
    analyze.mockResolvedValueOnce({ bestMove: "e2e4", candidates: [] });
    const onMove = vi.fn();
    const { result } = renderHook(() => useBestMove({ fen: START_FEN, contextKey: "start", onMove }));
    await act(async () => result.current.play());
    expect(result.current.error).toMatch(/try again/i);
    expect(result.current.disabled).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    await act(async () => result.current.play());
    expect(onMove).toHaveBeenCalledExactlyOnceWith("e2e4");
    expect(result.current.error).toBeUndefined();
  });

  it("preserves the engine's underpromotion even when candidates disagree", async () => {
    analyze.mockResolvedValue({ bestMove: "a7a8n", candidates: [{ uci: "a7a8q", scoreCp: 900 }] });
    const onMove = vi.fn();
    const { result } = renderHook(() => useBestMove({ fen: "7k/P7/8/8/8/8/8/7K w - - 0 1", contextKey: "promotion", onMove }));
    await act(async () => result.current.play());
    expect(onMove).toHaveBeenCalledExactlyOnceWith("a7a8n");
  });

  it.each([
    { fen: START_FEN, enabled: false },
    { fen: "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1", enabled: true },
    { fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", enabled: true },
  ])("does not search when disabled or terminal: %j", async (props) => {
    const { result } = renderHook(() => useBestMove({ ...props, contextKey: "disabled", onMove: vi.fn() }));
    expect(result.current.disabled).toBe(true);
    await act(async () => result.current.play());
    expect(analyze).not.toHaveBeenCalled();
  });
});
