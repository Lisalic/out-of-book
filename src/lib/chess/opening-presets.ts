export interface OpeningPreset {
  id: string;
  name: string;
  description: string;
  aliases: readonly string[];
  moves: readonly string[];
}

export const OPENING_PRESETS: readonly OpeningPreset[] = [
  {
    id: "italian-game",
    name: "Italian Game",
    description: "Rapid development aimed at the vulnerable f7-square.",
    aliases: ["Giuoco Piano"],
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6"],
  },
  {
    id: "sicilian-defence",
    name: "Sicilian Defence",
    description: "Black creates an imbalanced fight against 1. e4.",
    aliases: ["Sicilian", "Najdorf"],
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
  },
  {
    id: "french-defence",
    name: "French Defence",
    description: "A resilient pawn chain prepares pressure on White's centre.",
    aliases: ["French"],
    moves: ["e4", "e6", "d4", "d5", "Nc3", "Nf6", "e5", "Nfd7", "f4", "c5"],
  },
  {
    id: "ruy-lopez",
    name: "Ruy Lopez",
    description: "White pressures the e5-pawn through a classical bishop pin.",
    aliases: ["Spanish Opening", "Spanish Game"],
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"],
  },
  {
    id: "caro-kann-defence",
    name: "Caro-Kann Defence",
    description: "Black supports ...d5 while keeping the light bishop active.",
    aliases: ["Caro-Kann", "Caro Kann"],
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6"],
  },
  {
    id: "queens-gambit",
    name: "Queen's Gambit",
    description: "White offers a wing pawn to build lasting central pressure.",
    aliases: ["QGD", "Queen's Gambit Declined"],
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "O-O"],
  },
  {
    id: "kings-indian-defence",
    name: "King's Indian Defence",
    description: "Black concedes space before striking at White's centre.",
    aliases: ["KID", "King's Indian"],
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O"],
  },
  {
    id: "london-system",
    name: "London System",
    description: "A dependable setup built around an early Bf4.",
    aliases: ["London"],
    moves: ["d4", "d5", "Nf3", "Nf6", "Bf4", "e6", "e3", "Bd6", "Bg3", "O-O"],
  },
  {
    id: "english-opening",
    name: "English Opening",
    description: "White controls the centre from the flank with 1. c4.",
    aliases: ["English", "Four Knights English"],
    moves: ["c4", "e5", "Nc3", "Nf6", "Nf3", "Nc6", "g3", "d5", "cxd5", "Nxd5"],
  },
  {
    id: "scandinavian-defence",
    name: "Scandinavian Defence",
    description: "Black challenges 1. e4 immediately with ...d5.",
    aliases: ["Scandi", "Centre Counter"],
    moves: ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qd8", "d4", "Nf6", "Nf3", "c6"],
  },
  {
    id: "nimzo-indian-defence",
    name: "Nimzo-Indian Defence",
    description: "Black pins the c3-knight to restrain White's centre.",
    aliases: ["Nimzo", "Nimzo-Indian"],
    moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4", "e3", "O-O", "Bd3", "d5"],
  },
  {
    id: "pirc-defence",
    name: "Pirc Defence",
    description: "Black invites a broad centre, then attacks it from afar.",
    aliases: ["Pirc", "Modern Defence"],
    moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg7", "Be2", "O-O"],
  },
];

export function presetMovetext(preset: OpeningPreset): string {
  return `${preset.moves.join(" ")} *`;
}
