import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import {
  Chessboard,
  defaultPieces,
  type PieceDropHandlerArgs,
  type PieceHandlerArgs,
  type PieceRenderObject,
  type SquareHandlerArgs,
} from "react-chessboard";
import axios from "axios";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import {
  X,
  Plus,
  Play,
  Loader2,
  Shuffle,
  RotateCcw,
  Timer,
  Calendar,
  BarChart2,
  List as ListIcon,
  Swords,
  Target,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import ClockComponent from "@/Utils/ClockComponnet";


const THEMES = [
  { id: "opening", label: "Opening" },
  { id: "middlegame", label: "Middlegame" },
  { id: "endgame", label: "Endgame" },
  { id: "rookEndgame", label: "Rook endgame" },
  { id: "bishopEndgame", label: "Bishop endgame" },
  { id: "pawnEndgame", label: "Pawn endgame" },
  { id: "knightEndgame", label: "Knight endgame" },
  { id: "queenEndgame", label: "Queen endgame" },
  { id: "queenRookEndgame", "label": "Queen & Rook endgame" },

  { id: "discoveredAttack", label: "Discovered attack" },
  { id: "doubleCheck", label: "Double check" },
  { id: "fork", label: "Fork" },
  { id: "kingsideAttack", label: "Kingside attack" },
  { id: "pin", label: "Pin" },
  { id: "queensideAttack", label: "Queenside attack" },
  { id: "sacrifice", label: "Sacrifice" },
  { id: "skewer", label: "Skewer" },
  { id: "trappedPiece", label: "Trapped piece" },

  { id: "attraction", label: "Attraction" },
  { id: "defensiveMove", label: "Defensive move" },
  { id: "deflection", label: "Deflection" },
  { id: "intermezzo", label: "Intermezzo" },
  { id: "xRayAttack", label: "X-Ray attack" },

  { id: "mate", label: "Checkmate" },
  { id: "mateIn1", label: "Mate in 1" },
  { id: "mateIn2", label: "Mate in 2" },
  { id: "mateIn3", label: "Mate in 3" },
  { id: "mateIn4", label: "Mate in 4" },
  { id: "mateIn5", label: "Mate in 5+" },

  { id: "backRankMate", label: "Back rank mate" },
  { id: "smotheredMate", label: "Smothered mate" },


  { id: "castling", label: "Castling" },
  { id: "underPromotion", label: "Underpromotion" },

  { id: "equality", label: "Equality" },
  { id: "advantage", label: "Advantage" },
  { id: "crushing", label: "Crushing" },

  { id: "oneMove", label: "One-move" },
  { id: "short", label: "Short (2 moves)" },
  { id: "long", label: "Long (3 moves)" },
  { id: "veryLong", label: "Very long (4+ moves)" },

  { id: "master", label: "Master games" },
  { id: "masterVsMaster", label: "Master vs Master" },
  { id: "superGM", label: "Super GM games" },
] as const;

const DIFFICULTIES = [
  { id: "beginner", label: "Beginner", range: "< 1000", min: 0, max: 999 },
  { id: "easy", label: "Easy", range: "1000–1299", min: 1000, max: 1299 },
  { id: "intermediate", label: "Intermediate", range: "1300–1599", min: 1300, max: 1599 },
  { id: "hard", label: "Hard", range: "1600–1899", min: 1600, max: 1899 },
  { id: "expert", label: "Expert", range: "1900–2199", min: 1900, max: 2199 },
  { id: "master", label: "Master", range: "2200+", min: 2200, max: 3000 },
  { id: "mixed", label: "Mixed", range: "1000–2200", min: 1000, max: 2200 },
] as const;

const COUNTS = [10, 25, 50, 100] as const;

const schema = z.object({
  themes: z.array(z.string()),
  difficulty: z.string(),
  count: z.number(),
  shuffle: z.boolean(),
  repeatWrong: z.boolean(),
  showTimer: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface WoodpeakerSession {
  _id: string;
  title: string;
  totalpuzzles: number;
  status: string;
  updatedat: string;
  themes: string[];
  minrating: number;
  maxrating: number;
  createdat: string;
}

interface PuzzleItem {
  _id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  openingtags: string[];
  position: number;
}

type PuzzleFeedback = "idle" | "correct" | "wrong" | "solved";

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  return [];
};

const normalizePuzzle = (value: any): PuzzleItem => ({
  _id: String(value?._id ?? ""),
  fen: String(value?.fen ?? ""),
  moves: normalizeStringArray(value?.moves).map((m) => m.toLowerCase()),
  rating: Number(value?.rating ?? 0),
  themes: normalizeStringArray(value?.themes),
  openingtags: normalizeStringArray(value?.openingtags),
  position: Number(value?.position ?? 0),
});

/**
 * Parse a UCI move string (e.g. "e2e4", "e7e8q") into chess.js move params.
 */
const parseUciMove = (uci: string): { from: Square; to: Square; promotion?: PieceSymbol } | null => {
  const normalized = uci.trim().toLowerCase();
  if (normalized.length < 4) return null;
  const from = normalized.slice(0, 2) as Square;
  const to = normalized.slice(2, 4) as Square;
  const promo = normalized[4];
  const promotion = promo && ["q", "r", "b", "n"].includes(promo) ? (promo as PieceSymbol) : undefined;
  return { from, to, promotion };
};

/**
 * Determine board orientation from FEN.
 * The FEN's active color is the side TO MOVE — that's the human player's side.
 * We orient the board so the human plays from the bottom.
 */
const getBoardOrientationFromFen = (fen: string): "white" | "black" => {
  // FEN format: "rnbqkbnr/pppppppp/... w KQkq - 0 1"
  // The second space-separated token is the active color: 'w' or 'b'
  const parts = fen.trim().split(" ");
  const activeColor = parts[1]; // 'w' or 'b'
  return activeColor === "b" ? "white" : "black";
};


function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "relative w-10 h-[22px] rounded-full flex-shrink-0 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
        checked ? "bg-white/80" : "bg-white/10 hover:bg-white/15",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] left-[3px] w-4 h-4 rounded-full shadow-sm transition-all duration-200",
          checked ? "translate-x-[18px] bg-zinc-900" : "translate-x-0 bg-white/40",
        )}
      />
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3 select-none">
      {children}
    </p>
  );
}


interface WoodpeakerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function WoodpeakerModal({ open, onClose, onSuccess }: WoodpeakerModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { handleSubmit, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      themes: [],
      difficulty: "mixed",
      count: 25,
      shuffle: true,
      repeatWrong: true,
      showTimer: false,
    },
  });

  const watchedThemes = watch("themes");
  const watchedCount = watch("count");
  const watchedDiff = watch("difficulty");
  const diffCfg = DIFFICULTIES.find((d) => d.id === watchedDiff) ?? DIFFICULTIES[6];

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const [title, setTitle] = useState("");

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await axios.post("http://localhost:3030/woodpeaker/init", {
        ...data, "title": title,
      }, { withCredentials: true });
      if (res.status === 200 || res.status === 201) {
        onSuccess?.();
        onClose();
      } else {
        throw new Error("Server error");
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div ref={overlayRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-zinc-900/50">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">New Woodpecker Set</h2>
            <p className="text-xs text-white/40 mt-1">Configure your spaced repetition training</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto flex-1 p-6 space-y-8 custom-scrollbar">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
              <div className="mt-0.5">⚠️</div>
              <p>{error}</p>
            </div>
          )}

          <section>
            <Label>Number of Puzzles</Label>
            <div className="grid grid-cols-4 gap-2">
              {COUNTS.map((c) => {
                const active = watchedCount === c;
                return (
                  <button key={c} type="button" onClick={() => setValue("count", c)}
                    className={cn("py-3 rounded-xl text-sm font-medium transition-all duration-200",
                      active ? "bg-white text-zinc-900 shadow-md scale-[1.02]"
                        : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/5"
                    )}
                  >{c}</button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="flex justify-between items-end mb-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 select-none">Difficulty</p>
              <p className="text-[10px] font-medium text-white/40">Rating: {diffCfg.range}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DIFFICULTIES.map((d) => {
                const active = watchedDiff === d.id;
                return (
                  <button key={d.id} type="button" onClick={() => setValue("difficulty", d.id)}
                    className={cn("px-3 py-2.5 rounded-xl text-sm transition-all text-left border",
                      active ? "bg-zinc-800/80 border-white/20 text-white shadow-inner"
                        : "bg-transparent border-white/[0.04] text-white/50 hover:bg-white/5 hover:text-white hover:border-white/10"
                    )}
                  >
                    <span className="block font-medium">{d.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="flex justify-between items-end mb-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 select-none">Themes</p>
              <button type="button"
                onClick={() => setValue("themes", watchedThemes.length === THEMES.length ? [] : THEMES.map((t) => t.id))}
                className="text-[10px] uppercase tracking-wider font-semibold text-white/40 hover:text-white transition-colors"
              >
                {watchedThemes.length === THEMES.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => {
                const active = watchedThemes.includes(t.id);
                return (
                  <button key={t.id} type="button"
                    onClick={() => {
                      if (active) setValue("themes", watchedThemes.filter((id) => id !== t.id));
                      else setValue("themes", [...watchedThemes, t.id]);
                    }}
                    className={cn("px-3 py-1.5 rounded-lg text-[13px] transition-all border",
                      active ? "bg-white/10 border-white/20 text-white"
                        : "bg-transparent border-white/5 text-white/40 hover:bg-white/5 hover:text-white/80"
                    )}
                  >{t.label}</button>
                );
              })}
            </div>
          </section>

          <section className="space-y-1">
            <input type="text" placeholder="title" typeof="text" className="mb-2 w-full rounded-xl bg-white/5 border border-white/10 text-sm px-4 py-2 text-white/50 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-1 focus:ring-offset-zinc-900 transition-colors"
              value={title} onChange={(e) => setTitle(e.target.value)} />
            <Label>Advanced Settings</Label>
            <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-2">
              {[
                { name: "shuffle", label: "Shuffle puzzles", sub: "Randomize the order of puzzles in this set", icon: <Shuffle size={14} className="text-white/40" /> },
                { name: "repeatWrong", label: "Repeat incorrect", sub: "Force re-solving puzzles you get wrong", icon: <RotateCcw size={14} className="text-white/40" /> },
                { name: "showTimer", label: "Show timer", sub: "Display time spent on each puzzle", icon: <Timer size={14} className="text-white/40" /> },
              ].map((opt, i) => (
                <div key={opt.name} className={cn("flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-white/[0.02]", i !== 0 && "border-t border-white/5")}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/[0.04] rounded-lg">{opt.icon}</div>
                    <div className="text-left">
                      <p className="text-[13px] font-medium text-white/90">{opt.label}</p>
                      <p className="text-[11px] text-white/40">{opt.sub}</p>
                    </div>
                  </div>
                  <Toggle checked={watch(opt.name as any)} onChange={(v) => setValue(opt.name as any, v)} />
                </div>
              ))}
            </div>
          </section>

          <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 px-6 py-4 bg-zinc-900/90 backdrop-blur-md border-t border-white/10 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-[12px] font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-[12px] font-semibold bg-white text-zinc-900 hover:bg-white/90 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-black/30"
            >
              {submitting ? (<><Loader2 size={13} className="animate-spin" />Starting…</>) : (<><Play size={12} className="fill-zinc-900" />Start</>)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


const SPLASH_FEN = "r1bqk2r/pppp1ppp/2n2n2/1B2p3/2b1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4";
const LICHESS_LIGHT_SQUARE = "#f0d9b5";
const LICHESS_DARK_SQUARE = "#b58863";

interface PuzzleBoardProps {
  puzzle: PuzzleItem;
  onSolved: () => void;
  onFailed: () => void;
}

function PuzzleBoard({ puzzle, onSolved, onFailed }: PuzzleBoardProps) {
  type QueuedPremove = {
    sourceSquare: string;
    targetSquare: string;
    pieceType: string;
    promotion?: PieceSymbol;
  };
  type PendingPromotion = {
    sourceSquare: string;
    targetSquare: string;
    pieceColor: "w" | "b";
    mode: "move" | "premove";
  };

  // chess.js instance for this puzzle
  const chessRef = useRef<Chess>(new Chess());
  const [position, setPosition] = useState<string>("");
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [isUserTurn, setIsUserTurn] = useState(false);
  const [feedback, setFeedback] = useState<PuzzleFeedback>("idle");
  const [highlightSquares, setHighlightSquares] = useState<Record<string, React.CSSProperties>>({});
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [clickMoveTargets, setClickMoveTargets] = useState<string[]>([]);
  const [premoves, setPremoves] = useState<QueuedPremove[]>([]);
  const premovesRef = useRef<QueuedPremove[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const autoMoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExecutingPremoveRef = useRef(false);

  const clearAutoMove = () => {
    if (autoMoveRef.current) {
      clearTimeout(autoMoveRef.current);
      autoMoveRef.current = null;
    }
  };

  const clearPremoveTimer = useCallback(() => {
    if (premoveTimerRef.current) {
      clearTimeout(premoveTimerRef.current);
      premoveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearAutoMove();
    clearPremoveTimer();
    isExecutingPremoveRef.current = false;
    premovesRef.current = [];
    setPremoves([]);
    setPendingPromotion(null);

    try {
      const chess = new Chess();
      chess.load(puzzle.fen);
      chessRef.current = chess;

      // Determine orientation: who is to move in the starting FEN = human player
      const orientation = getBoardOrientationFromFen(puzzle.fen);
      setBoardOrientation(orientation);
      setPosition(chess.fen());
      setCurrentMoveIndex(0);
      setFeedback("idle");
      setHighlightSquares({});
      setSelectedSquare(null);
      setClickMoveTargets([]);

      // Strategy: play moves[0] automatically, then user plays moves[1], etc.
      if (puzzle.moves.length === 0) {
        onSolved();
        return;
      }

      // Play the first (opponent) move automatically after a short delay
      setIsUserTurn(false);
      autoMoveRef.current = setTimeout(() => {
        playMoveOnBoard(chess, puzzle.moves[0]);
        setCurrentMoveIndex(1);
        setIsUserTurn(true);
      }, 400);
    } catch (err) {
      console.error("Failed to load puzzle FEN:", puzzle.fen, err);
    }

    return () => {
      clearAutoMove();
      clearPremoveTimer();
      isExecutingPremoveRef.current = false;
    };
  }, [puzzle._id, clearPremoveTimer]); // only re-run when puzzle ID changes

  const playMoveOnBoard = (chess: Chess, uci: string): boolean => {
    const parsed = parseUciMove(uci);
    if (!parsed) return false;
    const result = chess.move(parsed);
    if (!result) return false;
    setPosition(chess.fen());
    return true;
  };

  const showFeedback = (type: PuzzleFeedback, squares?: Record<string, React.CSSProperties>) => {
    setFeedback(type);
    if (squares) setHighlightSquares(squares);
    else setHighlightSquares({});
  };

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setClickMoveTargets([]);
  }, []);

  const userColor = boardOrientation === "white" ? "w" : "b";

  const clearPremoves = useCallback(() => {
    clearPremoveTimer();
    isExecutingPremoveRef.current = false;
    premovesRef.current = [];
    setPremoves([]);
  }, [clearPremoveTimer]);

  const queuePremove = useCallback((move: QueuedPremove) => {
    premovesRef.current.push(move);
    setPremoves([...premovesRef.current]);
  }, []);

  const isPromotionTarget = useCallback((pieceType: string, targetSquare: string) => {
    if (pieceType[1]?.toLowerCase() !== "p") return false;
    const rank = targetSquare.slice(-1);
    const color = pieceType[0];
    return (color === "w" && rank === "8") || (color === "b" && rank === "1");
  }, []);

  const selectSquareForMove = useCallback(
    (square: string) => {
      const chess = chessRef.current;
      const piece = chess.get(square as Square);
      if (!piece || piece.color !== userColor) {
        clearSelection();
        return;
      }

      const legalTargets = chess.moves({ square: square as Square, verbose: true }).map((move) => move.to);
      if (legalTargets.length === 0) {
        clearSelection();
        return;
      }

      setSelectedSquare(square);
      setClickMoveTargets(legalTargets);
    },
    [clearSelection, userColor]
  );

  const squareStyles = useMemo(() => {
    const moveHintStyles: Record<string, React.CSSProperties> = {};
    const premoveStyles: Record<string, React.CSSProperties> = {};

    if (selectedSquare) {
      moveHintStyles[selectedSquare] = { backgroundColor: "rgba(59,130,246,0.35)" };
    }
    for (const square of clickMoveTargets) {
      moveHintStyles[square] = {
        ...(moveHintStyles[square] ?? {}),
        boxShadow: "inset 0 0 0 4px rgba(59,130,246,0.4)",
      };
    }

    for (const premove of premoves) {
      premoveStyles[premove.sourceSquare] = { backgroundColor: "rgba(239,68,68,0.28)" };
      premoveStyles[premove.targetSquare] = { backgroundColor: "rgba(239,68,68,0.2)" };
    }

    return { ...moveHintStyles, ...premoveStyles, ...highlightSquares };
  }, [selectedSquare, clickMoveTargets, premoves, highlightSquares]);

  const handleUserMove = useCallback(
    (sourceSquare: string, targetSquare: string, promotion?: PieceSymbol): boolean => {
      if (!isUserTurn || feedback === "wrong" || feedback === "solved") return false;

      const expectedUci = puzzle.moves[currentMoveIndex];
      if (!expectedUci) return false;

      const chess = chessRef.current;
      const sourcePiece = chess.get(sourceSquare as Square);
      if (!sourcePiece || sourcePiece.color !== userColor) {
        return false;
      }
      const legalMoves = chess.moves({ square: sourceSquare as Square, verbose: true })
        .filter((move) => move.to === targetSquare);
      if (legalMoves.length === 0) return false;

      const requiresPromotion = legalMoves.some((move) => Boolean(move.promotion));
      if (requiresPromotion && !promotion) {
        setPendingPromotion({
          sourceSquare,
          targetSquare,
          pieceColor: sourcePiece.color,
          mode: "move",
        });
        clearSelection();
        return true;
      }
      if (promotion && requiresPromotion && !legalMoves.some((move) => move.promotion === promotion)) {
        return false;
      }

      clearSelection();

      const playedUci = `${sourceSquare}${targetSquare}${promotion ?? ""}`.toLowerCase();
      const expectedKey = expectedUci.length >= 5
        ? expectedUci.slice(0, 5).toLowerCase()
        : expectedUci.slice(0, 4).toLowerCase();

      // Legal but wrong move
      if (playedUci !== expectedKey) {
        showFeedback("wrong", {
          [sourceSquare]: { backgroundColor: "rgba(239,68,68,0.5)" },
          [targetSquare]: { backgroundColor: "rgba(239,68,68,0.35)" },
        });
        // After a brief pause, let them try again (don't advance)
        setTimeout(() => {
          setFeedback("idle");
          setHighlightSquares({});
        }, 900);
        onFailed();
        return false;
      }

      // Correct move — play it
      const result = chess.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        ...(promotion ? { promotion } : {}),
      });
      if (!result) return false;

      setPosition(chess.fen());
      showFeedback("correct", {
        [result.from]: { backgroundColor: "rgba(34,197,94,0.45)" },
        [result.to]: { backgroundColor: "rgba(34,197,94,0.45)" },
      });

      const nextUserMoveIndex = currentMoveIndex + 2; // skip opponent's reply

      // Check if puzzle is done
      if (currentMoveIndex + 1 >= puzzle.moves.length) {
        // No more moves — puzzle solved!
        setTimeout(() => {
          showFeedback("solved");
          setIsUserTurn(false);
          setTimeout(onSolved, 250);
        }, 250);
        return true;
      }

      // Play opponent's response automatically
      setIsUserTurn(false);
      const opponentUci = puzzle.moves[currentMoveIndex + 1];

      autoMoveRef.current = setTimeout(() => {
        setHighlightSquares({});
        const opponentParsed = parseUciMove(opponentUci);
        if (opponentParsed) {
          const opponentResult = chess.move(opponentParsed);
          if (opponentResult) {
            setPosition(chess.fen());
            setHighlightSquares({
              [opponentResult.from]: { backgroundColor: "rgba(255,200,0,0.35)" },
              [opponentResult.to]: { backgroundColor: "rgba(255,200,0,0.35)" },
            });
          }
        }

        // Check if there are more user moves
        if (nextUserMoveIndex >= puzzle.moves.length) {
          // Puzzle complete after opponent's last move
          setTimeout(() => {
            showFeedback("solved");
            setIsUserTurn(false);
            setTimeout(onSolved, 250);
          }, 200);
          return;
        }

        setCurrentMoveIndex(nextUserMoveIndex);
        setIsUserTurn(true);
        setFeedback("idle");
      }, 500);

      return true;
    },
    [puzzle, currentMoveIndex, isUserTurn, feedback, clearSelection, onSolved, onFailed, userColor]
  );

  const tryExecuteQueuedPremove = useCallback(() => {
    if (!isUserTurn || feedback === "wrong" || feedback === "solved" || pendingPromotion) return;
    if (premoveTimerRef.current || isExecutingPremoveRef.current) return;
    if (premovesRef.current.length === 0) return;

    premoveTimerRef.current = setTimeout(() => {
      premoveTimerRef.current = null;
      const nextPremove = premovesRef.current[0];
      if (!nextPremove) return;

      premovesRef.current.splice(0, 1);
      setPremoves([...premovesRef.current]);
      isExecutingPremoveRef.current = true;

      const success = handleUserMove(
        nextPremove.sourceSquare,
        nextPremove.targetSquare,
        nextPremove.promotion
      );
      isExecutingPremoveRef.current = false;

      if (!success) {
        clearPremoves();
      }
    }, 250);
  }, [isUserTurn, feedback, pendingPromotion, handleUserMove, clearPremoves]
  );

  useEffect(() => {
    tryExecuteQueuedPremove();
  }, [tryExecuteQueuedPremove, premoves]);

  const onPromotionPieceSelect = useCallback((promotionPiece: PieceSymbol) => {
    if (!pendingPromotion) return;
    const promotionContext = pendingPromotion;
    setPendingPromotion(null);

    if (promotionContext.mode === "premove") {
      queuePremove({
        sourceSquare: promotionContext.sourceSquare,
        targetSquare: promotionContext.targetSquare,
        pieceType: `${promotionContext.pieceColor}P`,
        promotion: promotionPiece,
      });
      return;
    }

    const success = handleUserMove(
      promotionContext.sourceSquare,
      promotionContext.targetSquare,
      promotionPiece
    );
    if (!success) {
      clearPremoves();
    }
  }, [pendingPromotion, queuePremove, handleUserMove, clearPremoves]
  );

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare, piece }: PieceDropHandlerArgs): boolean => {
      if (!targetSquare || sourceSquare === targetSquare || pendingPromotion) return false;
      const pieceColor = piece.pieceType[0] as "w" | "b";
      if (pieceColor !== userColor) return false;

      if (!isUserTurn || isExecutingPremoveRef.current) {
        if (isPromotionTarget(piece.pieceType, targetSquare)) {
          setPendingPromotion({
            sourceSquare,
            targetSquare,
            pieceColor,
            mode: "premove",
          });
        } else {
          queuePremove({
            sourceSquare,
            targetSquare,
            pieceType: piece.pieceType,
          });
        }
        return true;
      }

      return handleUserMove(sourceSquare, targetSquare);
    },
    [pendingPromotion, userColor, isUserTurn, isPromotionTarget, queuePremove, handleUserMove]
  );

  const handleSquareRightClick = useCallback(() => {
    clearPremoves();
    if (pendingPromotion?.mode === "premove") {
      setPendingPromotion(null);
    }
  }, [clearPremoves, pendingPromotion]
  );

  const canDragPiece = useCallback(
    ({ piece }: PieceHandlerArgs) => {
      return piece.pieceType[0] === userColor;
    },
    [userColor]
  );

  const handleSquareClick = useCallback(
    ({ square }: SquareHandlerArgs) => {
      if (!isUserTurn || feedback === "wrong" || feedback === "solved" || pendingPromotion) return;

      if (!selectedSquare) {
        selectSquareForMove(square);
        return;
      }

      if (square === selectedSquare) {
        clearSelection();
        return;
      }

      if (clickMoveTargets.includes(square)) {
        handleUserMove(selectedSquare, square);
        return;
      }

      selectSquareForMove(square);
    },
    [isUserTurn, feedback, pendingPromotion, selectedSquare, clickMoveTargets, clearSelection, selectSquareForMove, handleUserMove]
  );

  const totalMoves = Math.ceil((puzzle.moves.length - 1) / 2); // user moves only
  const completedMoves = Math.floor((currentMoveIndex - 1) / 2);

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Feedback banner */}
      <div className={cn(
        "h-8 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-300",
        feedback === "correct" && "bg-green-500/15 text-green-400",
        feedback === "wrong" && "bg-red-500/15 text-red-400",
        feedback === "solved" && "bg-green-500/20 text-green-300",
        feedback === "idle" && "bg-white/[0.03] text-white/30",
      )}>
        {feedback === "correct" && <><CheckCircle2 size={15} /> Good move!</>}
        {feedback === "wrong" && <><XCircle size={15} /> Wrong — try again</>}
        {feedback === "solved" && <><CheckCircle2 size={15} /> Puzzle solved! ✓</>}
        {feedback === "idle" && (isUserTurn ? "Your turn" : "Opponent thinking…")}
      </div>

      {/* Board */}
      <div className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/[0.07]">
        <div className="w-full aspect-square relative">
          {pendingPromotion && (
            <div
              className="absolute inset-0 z-10 bg-black/35 flex items-center justify-center"
              onClick={() => setPendingPromotion(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setPendingPromotion(null);
              }}
            >
              <div
                className="bg-zinc-900 border border-white/10 rounded-xl p-2 flex items-center gap-1.5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {(["q", "r", "n", "b"] as PieceSymbol[]).map((piece) => (
                  <button
                    key={piece}
                    type="button"
                    className="w-16 h-16 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center"
                    onClick={() => onPromotionPieceSelect(piece)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {defaultPieces[
                      `${pendingPromotion.pieceColor}${piece.toUpperCase()}` as keyof PieceRenderObject
                    ]()}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Chessboard
            options={{
              position,
              boardOrientation,
              canDragPiece,
              onPieceDrop: handlePieceDrop,
              onSquareClick: handleSquareClick,
              onSquareRightClick: handleSquareRightClick,
              showAnimations: true,
              allowDragging: feedback !== "solved" && !pendingPromotion,
              squareStyles,
              darkSquareStyle: { backgroundColor: LICHESS_DARK_SQUARE },
              lightSquareStyle: { backgroundColor: LICHESS_LIGHT_SQUARE },
              boardStyle: { width: "100%", height: "100%", aspectRatio: "1 / 1" },
              draggingPieceGhostStyle: { filter: "drop-shadow(0 0 5px rgba(255,255,255,0.7))" },
            }}
          />
        </div>
      </div>

      {/* Move progress dots */}
      {totalMoves > 0 && (
        <div className="flex items-center justify-center gap-1.5 mt-1">
          {Array.from({ length: totalMoves }).map((_, i) => (
            <div key={i} className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              i < completedMoves ? "bg-green-400" : i === completedMoves ? "bg-white/60" : "bg-white/15"
            )} />
          ))}
        </div>
      )}
    </div>
  );
}


interface SessionViewProps {
  session: WoodpeakerSession;
  onBack: () => void;
}

function SessionView({ session, onBack }: SessionViewProps) {
  const [puzzles, setPuzzles] = useState<PuzzleItem[]>([]);
  const [puzzleLoading, setPuzzleLoading] = useState(true);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    const load = async () => {
      setPuzzleLoading(true);
      try {
        const { data } = await axios.get(`http://localhost:3030/woodpeaker/item/${session._id}`, { withCredentials: true });
        if (data?.data) {
          const normalized = (data.data as any[]).map(normalizePuzzle);
          setPuzzles(normalized);
          setCurrentPuzzleIndex(0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setPuzzleLoading(false);
      }
    };
    load();
  }, [session._id]);

  const currentPuzzle = puzzles[currentPuzzleIndex];

  const handleSolved = useCallback(() => {
    setScore((s) => ({ ...s, correct: s.correct + 1 }));
    setCurrentPuzzleIndex((i) => Math.min(i + 1, puzzles.length - 1));
  }, [puzzles.length]);

  const handleFailed = useCallback(() => {
    setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
  }, []);

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= puzzles.length) return;
    setCurrentPuzzleIndex(idx);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col p-4 md:p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Sessions</span>
        </button>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-green-400 font-medium">
            <CheckCircle2 size={14} /> {score.correct}
          </span>
          <span className="flex items-center gap-1.5 text-red-400 font-medium">
            <XCircle size={14} /> {score.wrong}
          </span>
          <span className="text-white/40">
            {currentPuzzleIndex + 1} / {puzzles.length}
          </span>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full">
        {puzzleLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="animate-spin text-white/50 w-8 h-8 mb-4" />
            <p className="text-white/50 text-sm">Loading puzzles...</p>
          </div>
        ) : !currentPuzzle ? (
          <div className="text-center text-white/50 py-20">No puzzles found for this session.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
            {/* Board column — takes all available space */}
            <div className="w-full max-w-[760px] mx-auto lg:mx-0">
              <PuzzleBoard
                key={`${currentPuzzle._id}-${currentPuzzleIndex}`}
                puzzle={currentPuzzle}
                onSolved={handleSolved}
                onFailed={handleFailed}
              />
            </div>

            {/* Info column */}
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{session.title || "Woodpecker Session"}</h2>
                <p className="text-sm text-white/40 mt-1">Puzzle {currentPuzzleIndex + 1} of {puzzles.length}</p>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/60 rounded-full transition-all duration-500"
                  style={{ width: `${((currentPuzzleIndex) / puzzles.length) * 100}%` }}
                />
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Target className="text-white/40" size={18} />
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Rating</p>
                    <p className="text-sm font-medium">{currentPuzzle.rating}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Swords className="text-white/40 mt-0.5" size={18} />
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-1">Themes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {currentPuzzle.themes?.map((theme) => (
                        <span key={theme} className="px-2 py-1 bg-white/10 rounded-md text-xs">{theme}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Score summary */}
                <div className="border-t border-white/5 pt-4 grid grid-cols-2 gap-3">
                  <div className="bg-green-500/10 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-400">{score.correct}</p>
                    <p className="text-[11px] text-green-400/70 uppercase tracking-wider">Solved</p>
                  </div>
                  <div className="bg-red-500/10 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{score.wrong}</p>
                    <p className="text-[11px] text-red-400/70 uppercase tracking-wider">Mistakes</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  disabled={currentPuzzleIndex === 0}
                  onClick={() => goTo(currentPuzzleIndex - 1)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={currentPuzzleIndex === puzzles.length - 1}
                  onClick={() => goTo(currentPuzzleIndex + 1)}
                  className="flex-1 py-3 rounded-xl bg-white text-zinc-900 hover:bg-white/90 text-sm font-semibold transition-colors disabled:opacity-30"
                >
                  Skip
                </button>
              </div>
              <div className="flex">
                <ClockComponent />
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}


export default function WoodpeakerPage() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<WoodpeakerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<WoodpeakerSession | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("http://localhost:3030/woodpeaker/list", { withCredentials: true });
      if (data?.data) setSessions(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  if (activeSession) {
    return <SessionView session={activeSession} onBack={() => setActiveSession(null)} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center pt-20 px-4 pb-12 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{ backgroundImage: "repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)", backgroundSize: "48px 48px" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.03]"
        style={{ background: "radial-gradient(circle, #ffffff 0%, transparent 70%)" }}
      />

      <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-4xl">
        {/* Header */}
        <div className="w-full flex flex-col md:flex-row items-center justify-between gap-6 bg-white/[0.02] border border-white/[0.05] p-6 rounded-3xl backdrop-blur-sm">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/[0.07] shrink-0 hidden sm:block">
              <Chessboard
                options={{
                  position: SPLASH_FEN,
                  allowDragging: false,
                  boardStyle: { width: "96px", height: "96px" },
                  darkSquareStyle: { backgroundColor: LICHESS_DARK_SQUARE },
                  lightSquareStyle: { backgroundColor: LICHESS_LIGHT_SQUARE },
                }}
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/30 select-none mb-1">Tactics Training</p>
              <h1 className="text-3xl font-bold text-white tracking-tight leading-none mb-2">Woodpecker Method</h1>
              <p className="text-sm text-white/50 leading-relaxed max-w-md">
                Improve your tactical vision through spaced repetition. Solve sets, learn patterns, and increase your speed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white text-zinc-900 text-sm font-semibold hover:bg-white/90 hover:scale-[1.02] transition-all active:scale-[0.98] shadow-lg shadow-black/40"
          >
            <Plus size={16} />
            Create New Set
          </button>
        </div>

        {/* Sessions */}
        <div className="w-full space-y-4">
          <div className="flex items-center gap-2 text-white/80 mb-6">
            <ListIcon size={18} />
            <h2 className="text-lg font-semibold tracking-tight">Your Sessions</h2>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="animate-spin text-white/30 w-8 h-8" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 px-4 border border-dashed border-white/10 rounded-3xl bg-white/[0.01]">
              <Target size={32} className="mx-auto text-white/20 mb-3" />
              <p className="text-white/60 font-medium">No active sessions</p>
              <p className="text-sm text-white/40 mt-1">Create your first training set to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map((session) => (
                <div
                  key={session._id}
                  onClick={() => setActiveSession(session)}
                  className="group bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.15] hover:bg-white/[0.05] rounded-2xl p-5 cursor-pointer transition-all duration-300"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-white/90 group-hover:text-white truncate pr-4">
                      {session.title || "Training Session"}
                    </h3>
                    <div className="px-2 py-1 rounded-md bg-white/10 text-[10px] font-medium text-white/70 uppercase tracking-wider">
                      {session.status}
                    </div>
                  </div>
                  <div className="space-y-3 mb-5">
                    <div className="flex items-center gap-2 text-sm text-white/50">
                      <Target size={14} />
                      <span>{session.totalpuzzles} Puzzles</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/50">
                      <BarChart2 size={14} />
                      <span>{session.minrating} - {session.maxrating} Rating</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/50">
                      <Calendar size={14} />
                      <span>{new Date(session.createdat).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {session.themes?.slice(0, 3).map((theme) => (
                      <span key={theme} className="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-white/40">{theme}</span>
                    ))}
                    {session.themes?.length > 3 && (
                      <span className="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-white/40">+{session.themes.length - 3}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <WoodpeakerModal open={open} onClose={() => setOpen(false)} onSuccess={fetchSessions} />
    </div>
  );
}
