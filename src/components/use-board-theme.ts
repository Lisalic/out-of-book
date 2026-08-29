"use client";

import { useState } from "react";

export interface BoardPalette {
  light: string;
  dark: string;
  highlight: string;
  check: string;
}

const FALLBACK: BoardPalette = {
  light: "#eeeed2",
  dark: "#6c8f56",
  highlight: "rgba(246, 246, 105, .58)",
  check: "rgba(200, 60, 45, .55)",
};

function readPalette(): BoardPalette {
  if (typeof window === "undefined") return FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const read = (name: keyof BoardPalette, cssVar: string) => style.getPropertyValue(cssVar).trim() || FALLBACK[name];
  return {
    light: read("light", "--board-light"),
    dark: read("dark", "--board-dark"),
    highlight: read("highlight", "--board-highlight"),
    check: read("check", "--board-check"),
  };
}

/**
 * Reads the board's colours from the same fixed CSS custom properties used
 * everywhere else. There's no runtime theming to react to (the app is a
 * single dark palette), so this is a one-time read on mount — React state is
 * only needed because react-chessboard takes inline style objects rather
 * than CSS classes.
 */
export function useBoardPalette(): BoardPalette {
  const [palette] = useState<BoardPalette>(readPalette);
  return palette;
}
