const FIGURINES: Record<string, string> = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };

/** Renders SAN with a figurine glyph in place of the piece letter (Nf3 → ♘f3). Castling and pawn moves are unaffected. */
export function figurineSan(san: string): string {
  const letter = san[0];
  return FIGURINES[letter] ? FIGURINES[letter] + san.slice(1) : san;
}
