"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { MoveSound } from "@/lib/chess/move-sound";

export type BoardSound = MoveSound | "rejected" | "illegal";

const STORAGE_KEY = "out-of-book-board-sound-muted";
const SOUND_SOURCES: Record<BoardSound, string> = {
  move: "/sounds/chesscom/move-self.mp3",
  capture: "/sounds/chesscom/capture.mp3",
  castle: "/sounds/chesscom/castle.mp3",
  check: "/sounds/chesscom/move-check.mp3",
  promotion: "/sounds/chesscom/promote.mp3",
  "game-end": "/sounds/chesscom/game-end.mp3",
  rejected: "/sounds/chesscom/illegal.mp3",
  illegal: "/sounds/chesscom/illegal.mp3",
};

const listeners = new Set<() => void>();
const audioBySound = new Map<BoardSound, HTMLAudioElement>();
let activeAudio: HTMLAudioElement | undefined;
let fallbackMuted = false;
let storageWriteFailed = false;
let lastStorage: Storage | undefined;

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getMuted(): boolean {
  try {
    const storage = window.localStorage;
    if (storage !== lastStorage) {
      lastStorage = storage;
      storageWriteFailed = false;
    }
    if (!storageWriteFailed) {
      const stored = storage.getItem(STORAGE_KEY);
      if (stored !== null) fallbackMuted = stored === "1";
    }
  } catch {
    // Keep the current in-memory preference when storage is unavailable.
  }
  return fallbackMuted;
}

function audioFor(sound: BoardSound): HTMLAudioElement {
  const cached = audioBySound.get(sound);
  if (cached) return cached;

  const audio = new Audio(SOUND_SOURCES[sound]);
  audio.preload = "auto";
  audio.volume = 1;
  audioBySound.set(sound, audio);
  return audio;
}

function stopActiveCue() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = undefined;
}

export function unlockBoardSound() {
  if (typeof window === "undefined" || getMuted()) return;
  try {
    // Constructing preloaded elements during the first gesture warms every local cue.
    Object.keys(SOUND_SOURCES).forEach((sound) => audioFor(sound as BoardSound));
  } catch {
    // Sound is enhancement only; unsupported media APIs must not affect board input.
  }
}

export function playBoardSound(sound: BoardSound) {
  if (getMuted()) return;
  try {
    // Last-cue-wins keeps rapid navigation and engine replies crisp instead of stacking sounds.
    stopActiveCue();
    activeAudio = audioFor(sound);
    activeAudio.currentTime = 0;
    void activeAudio.play().catch(() => undefined);
  } catch {
    activeAudio = undefined;
  }
}

function toggleMuted() {
  const muted = !getMuted();
  fallbackMuted = muted;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    storageWriteFailed = false;
  } catch {
    storageWriteFailed = true;
  }
  if (muted) stopActiveCue();
  else unlockBoardSound();
  listeners.forEach((listener) => listener());
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={muted ? "text-ink-faint" : "text-accent"}
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {muted ? (
        <path d="m16 9 5 6M21 9l-5 6" />
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

export function SoundToggle({ className = "btn" }: { className?: string }) {
  const muted = useSyncExternalStore(subscribe, getMuted, () => false);
  const label = muted ? "Unmute board sounds" : "Mute board sounds";

  useEffect(() => {
    window.addEventListener("pointerdown", unlockBoardSound, true);
    window.addEventListener("keydown", unlockBoardSound, true);
    return () => {
      window.removeEventListener("pointerdown", unlockBoardSound, true);
      window.removeEventListener("keydown", unlockBoardSound, true);
    };
  }, []);

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={muted}
      title={label}
      onClick={toggleMuted}
    >
      <SpeakerIcon muted={muted} />
    </button>
  );
}
