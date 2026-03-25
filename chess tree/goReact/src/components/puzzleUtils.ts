import { Chess, type Square } from "chess.js";

export interface EngineLine {
  pvIdx: number;
  depth: number;
  score: number | null;
  mate: number | null;
  pv: string[];
  pvSan: string[];
}

export interface PuzzleAttempt {
  puzzleId: string;
  result: "correct" | "wrong" | "skipped";
}

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
}

export const uciToSan = (fen: string, uci: string): string => {
  if (!uci || uci.length < 4) return uci;
  try {
    const game = new Chess(fen);
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const move = game.move({ from, to, promotion });
    return move ? move.san : uci;
  } catch {
    return uci;
  }
};

export const pvToSan = (fen: string, pvMoves: string[]): string[] => {
  if (!pvMoves || pvMoves.length === 0) return [];
  try {
    const game = new Chess(fen);
    const sanMoves: string[] = [];
    for (const uci of pvMoves) {
      if (!uci || uci.length < 4) break;
      const from = uci.slice(0, 2) as Square;
      const to = uci.slice(2, 4) as Square;
      const promotion = uci.length > 4 ? uci[4] : undefined;
      const move = game.move({ from, to, promotion });
      if (move) {
        sanMoves.push(move.san);
      } else {
        break;
      }
    }
    return sanMoves;
  } catch {
    return pvMoves;
  }
};

export const formatScore = (score: number | null, mate: number | null): string => {
  if (mate !== null) {
    return mate > 0 ? `#${mate}` : `#${Math.abs(mate)}`;
  }
  if (score === null) return "0.00";
  const val = score / 100;
  return val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
};

export const scoreToPercent = (score: number | null, mate: number | null): number => {
  if (mate !== null) return mate > 0 ? 95 : 5;
  if (score === null) return 50;
  const sigmoid = 1 / (1 + Math.exp(-score / 300));
  return Math.round(sigmoid * 100);
};

// Lichess-inspired colors
export const colors = {
  bgPrimary: "#161512",
  bgSecondary: "#262421",
  bgTertiary: "#302e2c",
  textPrimary: "#bababa",
  textSecondary: "#8b8987",
  textMuted: "#6e6c6a",
  accentGreen: "#629924",
  accentRed: "#cc3333",
  accentBlue: "#3893e8",
  border: "#3a3836",

  // Arrow colors
  arrowGreen: "rgba(98, 153, 36, 0.8)",
  arrowRed: "rgba(204, 51, 51, 0.8)",
  arrowBlue: "rgba(56, 147, 232, 0.6)",
};
