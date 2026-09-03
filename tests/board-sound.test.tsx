import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { playBoardSound, SoundToggle } from "@/components/board-sound";
import { MoveNavStrip } from "@/components/move-nav";
import { PracticeSetup } from "@/components/practice-screens";
import { emptyGraph } from "@/lib/chess/graph";

class FakeAudio {
  preload = "";
  volume = 0;
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();

  constructor(public src: string) {
    audioElements.push(this);
  }
}

const audioElements: FakeAudio[] = [];
const values = new Map<string, string>();
const memoryStorage = {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};

beforeAll(() => {
  Object.defineProperty(window, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memoryStorage,
  });
});

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage });
  values.set("out-of-book-board-sound-muted", "0");
  audioElements.forEach((audio) => {
    audio.play.mockClear();
    audio.pause.mockClear();
  });
});

describe("board sound", () => {
  it("keeps mute controls synchronized and persists the preference", () => {
    const first = render(<><SoundToggle /><SoundToggle /></>);

    fireEvent.click(screen.getAllByRole("button", { name: "Mute board sounds" })[0]);

    expect(screen.getAllByRole("button", { name: "Unmute board sounds" })).toHaveLength(2);
    expect(window.localStorage.getItem("out-of-book-board-sound-muted")).toBe("1");

    first.unmount();
    render(<SoundToggle />);
    expect(screen.getByRole("button", { name: "Unmute board sounds" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Unmute board sounds" }).querySelectorAll("path")).toHaveLength(2);
  });

  it("does not play audio while muted", () => {
    window.localStorage.setItem("out-of-book-board-sound-muted", "1");
    playBoardSound("move");
    expect(audioElements.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });

  it("preloads audio during a user gesture without playing a cue", () => {
    render(<SoundToggle />);
    fireEvent.pointerDown(document.body);
    expect(audioElements).toHaveLength(8);
    expect(audioElements.every((audio) => audio.preload === "auto")).toBe(true);
    expect(audioElements.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });

  it("still toggles for the current page when storage is unavailable", () => {
    const primingView = render(<SoundToggle />);
    primingView.unmount();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
    });

    render(<SoundToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Mute board sounds" }));
    expect(screen.getByRole("button", { name: "Unmute board sounds" })).toBeVisible();
  });

  it("keeps the in-memory preference when only storage writes are blocked", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: memoryStorage.getItem, setItem: () => { throw new Error("blocked"); } },
    });

    render(<SoundToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Mute board sounds" }));
    expect(screen.getByRole("button", { name: "Unmute board sounds" })).toBeVisible();
  });

  it("stops the previous cue before playing the next one", () => {
    playBoardSound("move");
    const firstCue = audioElements.find((audio) => audio.src.endsWith("/move-self.mp3"));

    playBoardSound("capture");

    expect(firstCue?.volume).toBe(1);
    expect(firstCue?.play).toHaveBeenCalledOnce();
    expect(firstCue?.pause).toHaveBeenCalledOnce();
    expect(audioElements.find((audio) => audio.src.endsWith("/capture.mp3"))?.play).toHaveBeenCalledOnce();
  });

  it("includes a mute control in board move navigation", () => {
    render(<MoveNavStrip atStart atEnd onFirst={vi.fn()} onPrev={vi.fn()} onNext={vi.fn()} onLast={vi.fn()} onFlip={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Mute board sounds" })).toBeVisible();
  });

  it("unlocks audio on the gesture that starts a training session", () => {
    const onStart = vi.fn();
    render(
      <PracticeSetup
        repertoire={{ id: "rep", name: "Test", traineeColor: "white", graph: emptyGraph(), createdAt: "", updatedAt: "", revision: 1 }}
        strength={1200}
        frequency="never"
        sessionSize={1}
        lineCount={1}
        dueCount={1}
        onBack={vi.fn()}
        onStrengthChange={vi.fn()}
        onFrequencyChange={vi.fn()}
        onSessionSizeChange={vi.fn()}
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start session →" }));
    expect(audioElements).toHaveLength(8);
    expect(onStart).toHaveBeenCalledOnce();
  });
});
