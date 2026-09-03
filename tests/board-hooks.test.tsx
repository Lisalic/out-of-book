import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardFlip } from "@/components/use-board-flip";
import { useBoardKeys, type BoardKeyActions } from "@/components/use-board-keys";

function bindKeys(actions: BoardKeyActions) {
  function Harness() {
    useBoardKeys(actions);
    return (
      <>
        <input aria-label="a text field" />
        <textarea aria-label="a comment field" />
      </>
    );
  }
  render(<Harness />);
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(window, { key, ...init });
}

describe("useBoardKeys", () => {
  it("steps, jumps, flips, and fires the primary action from the keyboard", () => {
    const actions = {
      onPrev: vi.fn(),
      onNext: vi.fn(),
      onStart: vi.fn(),
      onEnd: vi.fn(),
      onFlip: vi.fn(),
      onPrimary: vi.fn(),
    };
    bindKeys(actions);

    press("ArrowLeft");
    press("ArrowRight");
    press("ArrowUp");
    press("ArrowDown");
    press("f");
    press("F");
    press(" ");

    expect(actions.onPrev).toHaveBeenCalledTimes(1);
    expect(actions.onNext).toHaveBeenCalledTimes(1);
    expect(actions.onStart).toHaveBeenCalledTimes(1);
    expect(actions.onEnd).toHaveBeenCalledTimes(1);
    expect(actions.onFlip).toHaveBeenCalledTimes(2);
    expect(actions.onPrimary).toHaveBeenCalledTimes(1);
  });

  it("picks a numbered option zero-indexed, and only for 1-9", () => {
    const onSelectOption = vi.fn();
    bindKeys({ onSelectOption });

    press("1");
    press("4");
    press("9");
    press("0");

    expect(onSelectOption.mock.calls.map(([index]) => index)).toEqual([0, 3, 8]);
  });

  it("stays out of the way while the user is typing", () => {
    const onNext = vi.fn();
    const onSelectOption = vi.fn();
    bindKeys({ onNext, onSelectOption });

    fireEvent.keyDown(screen.getByLabelText("a text field"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByLabelText("a comment field"), { key: "3" });

    expect(onNext).not.toHaveBeenCalled();
    expect(onSelectOption).not.toHaveBeenCalled();
  });

  it("leaves browser and OS shortcuts alone", () => {
    const onNext = vi.fn();
    bindKeys({ onNext });

    press("ArrowRight", { metaKey: true });
    press("ArrowRight", { ctrlKey: true });
    press("ArrowRight", { altKey: true });

    expect(onNext).not.toHaveBeenCalled();
  });

  it("does nothing for an action the screen has not offered", () => {
    const onPrev = vi.fn();
    bindKeys({ onPrev });
    // No onNext for this screen: the key must fall through rather than throw.
    expect(() => press("ArrowRight")).not.toThrow();
    press("ArrowLeft");
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("can be switched off entirely", () => {
    const onNext = vi.fn();
    bindKeys({ onNext, enabled: false });
    press("ArrowRight");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("stops listening once the screen is gone", () => {
    const onNext = vi.fn();
    function Harness() {
      useBoardKeys({ onNext });
      return null;
    }
    const view = render(<Harness />);
    view.unmount();
    press("ArrowRight");
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("useBoardFlip", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts unflipped and remembers the choice for the next visit", () => {
    const { result } = renderHook(() => useBoardFlip());
    expect(result.current.flipped).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.flipped).toBe(true);
    expect(window.localStorage.getItem("out-of-book-board-flipped")).toBe("1");

    act(() => result.current.toggle());
    expect(result.current.flipped).toBe(false);
  });

  it("keeps every board on the screen facing the same way", () => {
    const first = renderHook(() => useBoardFlip());
    const second = renderHook(() => useBoardFlip());

    act(() => first.result.current.toggle());

    expect(first.result.current.flipped).toBe(true);
    expect(second.result.current.flipped).toBe(true);
  });

  it("still flips when storage is unavailable, it just cannot remember it", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const { result } = renderHook(() => useBoardFlip());
    expect(() => act(() => result.current.toggle())).not.toThrow();
    setItem.mockRestore();
  });
});
