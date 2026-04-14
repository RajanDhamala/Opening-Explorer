import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Chessboard } from "react-chessboard";
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
} from "lucide-react";

// ── Types & Schema ────────────────────────────────────────────────────────────

const THEMES = [
  { id: "fork", label: "Fork" },
  { id: "pin", label: "Pin" },
  { id: "skewer", label: "Skewer" },
  { id: "discoveredAttack", label: "Discovery" },
  { id: "mateIn1", label: "Mate in 1" },
  { id: "mateIn2", label: "Mate in 2" },
  { id: "backRankMate", label: "Back rank" },
  { id: "endgame", label: "Endgame" },
  { id: "deflection", label: "Deflection" },
  { id: "sacrifice", label: "Sacrifice" },
  { id: "zwischenzug", label: "Zwischenzug" },
  { id: "xRayAttack", label: "X-ray" },
] as const;

const DIFFICULTIES = [
  { id: "beginner", label: "Beginner", range: "< 1000", min: 0, max: 999 },
  { id: "easy", label: "Easy", range: "1000–1299", min: 1000, max: 1299 },
  {
    id: "intermediate",
    label: "Intermediate",
    range: "1300–1599",
    min: 1300,
    max: 1599,
  },
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

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
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

const parseUciMove = (uci: string) => {
  const normalized = uci.trim().toLowerCase();
  if (normalized.length < 4) return null;

  const from = normalized.slice(0, 2) as Square;
  const to = normalized.slice(2, 4) as Square;
  const promo = normalized[4];
  const promotion =
    promo && ["q", "r", "b", "n"].includes(promo)
      ? (promo as PieceSymbol)
      : undefined;

  return { from, to, promotion };
};

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
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
          checked
            ? "translate-x-[18px] bg-zinc-900"
            : "translate-x-0 bg-white/40",
        )}
      />
    </button>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3 select-none">
      {children}
    </p>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface WoodpeakerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function WoodpeakerModal({
  open,
  onClose,
  onSuccess,
}: WoodpeakerModalProps) {
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
  const diffCfg =
    DIFFICULTIES.find((d) => d.id === watchedDiff) ?? DIFFICULTIES[6];

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await axios.post(
        "http://localhost:3030/woodpeaker/init",
        data,
        { withCredentials: true },
      );
      if (res.status === 200 || res.status === 201) {
        onSuccess?.();
        onClose();
      } else {
        throw new Error("Server error");
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e.message || "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // const themeLabel = (id: string) => THEMES.find((t) => t.id === id)?.label;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-zinc-900/50">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">
              New Woodpecker Set
            </h2>
            <p className="text-xs text-white/40 mt-1">
              Configure your spaced repetition training
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="overflow-y-auto flex-1 p-6 space-y-8 custom-scrollbar"
        >
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
              <div className="mt-0.5">⚠️</div>
              <p>{error}</p>
            </div>
          )}

          {/* Quantity */}
          <section>
            <Label>Number of Puzzles</Label>
            <div className="grid grid-cols-4 gap-2">
              {COUNTS.map((c) => {
                const active = watchedCount === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValue("count", c)}
                    className={cn(
                      "py-3 rounded-xl text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-white text-zinc-900 shadow-md scale-[1.02]"
                        : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/5",
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Difficulty */}
          <section>
            <div className="flex justify-between items-end mb-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 select-none">
                Difficulty
              </p>
              <p className="text-[10px] font-medium text-white/40">
                Rating: {diffCfg.range}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DIFFICULTIES.map((d) => {
                const active = watchedDiff === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setValue("difficulty", d.id)}
                    className={cn(
                      "px-3 py-2.5 rounded-xl text-sm transition-all text-left border",
                      active
                        ? "bg-zinc-800/80 border-white/20 text-white shadow-inner"
                        : "bg-transparent border-white/[0.04] text-white/50 hover:bg-white/5 hover:text-white hover:border-white/10",
                    )}
                  >
                    <span className="block font-medium">{d.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Themes */}
          <section>
            <div className="flex justify-between items-end mb-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 select-none">
                Themes
              </p>
              <button
                type="button"
                onClick={() =>
                  setValue(
                    "themes",
                    watchedThemes.length === THEMES.length
                      ? []
                      : THEMES.map((t) => t.id),
                  )
                }
                className="text-[10px] uppercase tracking-wider font-semibold text-white/40 hover:text-white transition-colors"
              >
                {watchedThemes.length === THEMES.length
                  ? "Clear all"
                  : "Select all"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => {
                const active = watchedThemes.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (active) {
                        setValue(
                          "themes",
                          watchedThemes.filter((id) => id !== t.id),
                        );
                      } else {
                        setValue("themes", [...watchedThemes, t.id]);
                      }
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[13px] transition-all border",
                      active
                        ? "bg-white/10 border-white/20 text-white"
                        : "bg-transparent border-white/5 text-white/40 hover:bg-white/5 hover:text-white/80",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Advanced Toggles */}
          <section className="space-y-1">
            <Label>Advanced Settings</Label>
            <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-2">
              {[
                {
                  name: "shuffle",
                  label: "Shuffle puzzles",
                  sub: "Randomize the order of puzzles in this set",
                  icon: <Shuffle size={14} className="text-white/40" />,
                },
                {
                  name: "repeatWrong",
                  label: "Repeat incorrect",
                  sub: "Force re-solving puzzles you get wrong",
                  icon: <RotateCcw size={14} className="text-white/40" />,
                },
                {
                  name: "showTimer",
                  label: "Show timer",
                  sub: "Display time spent on each puzzle",
                  icon: <Timer size={14} className="text-white/40" />,
                },
              ].map((opt, i) => (
                <div
                  key={opt.name}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-white/[0.02]",
                    i !== 0 && "border-t border-white/5",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/[0.04] rounded-lg">
                      {opt.icon}
                    </div>
                    <div className="text-left">
                      <p className="text-[13px] font-medium text-white/90">
                        {opt.label}
                      </p>
                      <p className="text-[11px] text-white/40">{opt.sub}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={watch(opt.name as any)}
                    onChange={(v) => setValue(opt.name as any, v)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Footer Actions */}
          <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 px-6 py-4 bg-zinc-900/90 backdrop-blur-md border-t border-white/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-[12px] font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-[12px] font-semibold bg-white text-zinc-900 hover:bg-white/90 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-black/30"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Play size={12} className="fill-zinc-900" />
                  Start
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────

const SPLASH_FEN =
  "r1bqk2r/pppp1ppp/2n2n2/1B2p3/2b1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4";

export default function WoodpeakerPage() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<WoodpeakerSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSession, setActiveSession] = useState<WoodpeakerSession | null>(
    null,
  );
  const [puzzles, setPuzzles] = useState<PuzzleItem[]>([]);
  const [puzzleLoading, setPuzzleLoading] = useState(false);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [isUserTurn, setIsUserTurn] = useState(true);
  const [position, setPosition] = useState(SPLASH_FEN);
  const chessRef = useRef(new Chess());
  const autoMoveTimeoutRef = useRef<number | null>(null);
  const puzzleIndexRef = useRef(0);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(
        "http://localhost:3030/woodpeaker/list",
        {
          withCredentials: true,
        },
      );
      if (data && data.data) {
        setSessions(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const clearAutoMoveTimeout = () => {
    if (autoMoveTimeoutRef.current !== null) {
      window.clearTimeout(autoMoveTimeoutRef.current);
      autoMoveTimeoutRef.current = null;
    }
  };

  const loadPuzzleToBoard = (puzzle: PuzzleItem | undefined) => {
    if (!puzzle) return;

    try {
      const chess = new Chess();
      chess.load(puzzle.fen);
      chessRef.current = chess;
      setPosition(chess.fen());
      setCurrentMoveIndex(0);
      setIsUserTurn(true);
    } catch (err) {
      console.error("Invalid puzzle FEN:", puzzle.fen, err);
      chessRef.current = new Chess();
      setPosition(SPLASH_FEN);
      setCurrentMoveIndex(0);
      setIsUserTurn(true);
    }
  };

  const goToPuzzle = (index: number) => {
    if (index < 0 || index >= puzzles.length) return;
    clearAutoMoveTimeout();
    setCurrentPuzzleIndex(index);
  };

  const goToNextPuzzle = () => {
    setCurrentPuzzleIndex((idx) => {
      if (idx >= puzzles.length - 1) return idx;
      return idx + 1;
    });
  };

  const handleSessionClick = async (session: WoodpeakerSession) => {
    setActiveSession(session);
    setPuzzleLoading(true);
    try {
      const { data } = await axios.get(
        `http://localhost:3030/woodpeaker/item/${session._id}`,
        {
          withCredentials: true,
        },
      );
      if (data && data.data) {
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

  useEffect(() => {
    puzzleIndexRef.current = currentPuzzleIndex;
  }, [currentPuzzleIndex]);

  useEffect(() => {
    const current = puzzles[currentPuzzleIndex];
    if (!current) return;
    clearAutoMoveTimeout();
    loadPuzzleToBoard(current);
  }, [puzzles, currentPuzzleIndex]);

  useEffect(() => {
    return () => {
      clearAutoMoveTimeout();
    };
  }, []);

  const currentPuzzle = puzzles[currentPuzzleIndex];

  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!targetSquare) return false;
    if (!currentPuzzle || !isUserTurn) return false;

    const expectedMove = currentPuzzle.moves[currentMoveIndex];
    if (!expectedMove) {
      goToNextPuzzle();
      return false;
    }

    const playedMove = `${sourceSquare}${targetSquare}`.toLowerCase();
    const expectedKey = expectedMove.slice(0, 4).toLowerCase();

    if (playedMove !== expectedKey) {
      goToNextPuzzle();
      return false;
    }

    const parsedPlayerMove = parseUciMove(expectedMove);
    if (!parsedPlayerMove || !chessRef.current.move(parsedPlayerMove)) {
      goToNextPuzzle();
      return false;
    }

    setPosition(chessRef.current.fen());
    const nextMoveIndex = currentMoveIndex + 1;

    if (nextMoveIndex >= currentPuzzle.moves.length) {
      goToNextPuzzle();
      return true;
    }

    setCurrentMoveIndex(nextMoveIndex);
    setIsUserTurn(false);

    const puzzleAtMoveTime = currentPuzzle;
    const puzzleIdxAtMoveTime = currentPuzzleIndex;

    autoMoveTimeoutRef.current = window.setTimeout(() => {
      if (puzzleIndexRef.current !== puzzleIdxAtMoveTime) return;

      const autoUci = puzzleAtMoveTime.moves[nextMoveIndex];
      const parsedAutoMove = autoUci ? parseUciMove(autoUci) : null;

      if (!parsedAutoMove || !chessRef.current.move(parsedAutoMove)) {
        goToNextPuzzle();
        return;
      }

      setPosition(chessRef.current.fen());

      const userReplyIndex = nextMoveIndex + 1;
      if (userReplyIndex >= puzzleAtMoveTime.moves.length) {
        goToNextPuzzle();
        return;
      }

      setCurrentMoveIndex(userReplyIndex);
      setIsUserTurn(true);
    }, 350);

    return true;
  };

  if (activeSession) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col p-6">
        <button
          onClick={() => setActiveSession(null)}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors w-max mb-6"
        >
          <ArrowLeft size={16} />
          Back to Sessions
        </button>

        <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {puzzleLoading ? (
            <div className="col-span-2 flex flex-col items-center justify-center py-20">
              <Loader2 className="animate-spin text-white/50 w-8 h-8 mb-4" />
              <p className="text-white/50 text-sm">Loading puzzles...</p>
            </div>
          ) : currentPuzzle ? (
            <>
              <div className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/[0.07]">
                <Chessboard
                  options={{
                    position,
                    onPieceDrop: handlePieceDrop,
                    allowDragging: isUserTurn,
                    darkSquareStyle: { backgroundColor: "#3d3d3d" },
                    lightSquareStyle: { backgroundColor: "#a8a29e" },
                  }}
                />
              </div>
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    {activeSession.title || "Woodpecker Session"}
                  </h2>
                  <p className="text-sm text-white/40 mt-1">
                    Puzzle {currentPuzzleIndex + 1} of {puzzles.length}
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Target className="text-white/40" size={18} />
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">
                        Rating
                      </p>
                      <p className="text-sm font-medium">
                        {currentPuzzle.rating}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Swords className="text-white/40 mt-0.5" size={18} />
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-1">
                        Themes
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {currentPuzzle.themes?.map((theme) => (
                          <span
                            key={theme}
                            className="px-2 py-1 bg-white/10 rounded-md text-xs"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    disabled={currentPuzzleIndex === 0}
                    onClick={() => goToPuzzle(currentPuzzleIndex - 1)}
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPuzzleIndex === puzzles.length - 1}
                    onClick={() => goToPuzzle(currentPuzzleIndex + 1)}
                    className="flex-1 py-3 rounded-xl bg-white text-zinc-900 hover:bg-white/90 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-2 text-center text-white/50 py-20">
              No puzzles found for this session.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center pt-20 px-4 pb-12 relative overflow-hidden">
      {/* ── Subtle noise / grain overlay ── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* ── Ambient glow behind content ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.03]"
        style={{
          background: "radial-gradient(circle, #ffffff 0%, transparent 70%)",
        }}
      />

      {/* ── Main content ── */}
      <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-4xl">
        {/* Header Section */}
        <div className="w-full flex flex-col md:flex-row items-center justify-between gap-6 bg-white/[0.02] border border-white/[0.05] p-6 rounded-3xl backdrop-blur-sm">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/[0.07] shrink-0 hidden sm:block">
              <Chessboard
                options={{
                  position: SPLASH_FEN,
                  allowDragging: false,
                  boardStyle: { width: "96px", height: "96px" },
                  darkSquareStyle: { backgroundColor: "#3d3d3d" },
                  lightSquareStyle: { backgroundColor: "#a8a29e" },
                }}
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/30 select-none mb-1">
                Tactics Training
              </p>
              <h1 className="text-3xl font-bold text-white tracking-tight leading-none mb-2">
                Woodpecker Method
              </h1>
              <p className="text-sm text-white/50 leading-relaxed max-w-md">
                Improve your tactical vision through spaced repetition. Solve
                sets, learn patterns, and increase your speed.
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

        {/* Sessions List */}
        <div className="w-full space-y-4">
          <div className="flex items-center gap-2 text-white/80 mb-6">
            <ListIcon size={18} />
            <h2 className="text-lg font-semibold tracking-tight">
              Your Sessions
            </h2>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="animate-spin text-white/30 w-8 h-8" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 px-4 border border-dashed border-white/10 rounded-3xl bg-white/[0.01]">
              <Target size={32} className="mx-auto text-white/20 mb-3" />
              <p className="text-white/60 font-medium">No active sessions</p>
              <p className="text-sm text-white/40 mt-1">
                Create your first training set to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map((session) => (
                <div
                  key={session._id}
                  onClick={() => handleSessionClick(session)}
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
                      <span>
                        {session.minrating} - {session.maxrating} Rating
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/50">
                      <Calendar size={14} />
                      <span>
                        {new Date(session.createdat).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {session.themes?.slice(0, 3).map((theme) => (
                      <span
                        key={theme}
                        className="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-white/40"
                      >
                        {theme}
                      </span>
                    ))}
                    {session.themes?.length > 3 && (
                      <span className="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-white/40">
                        +{session.themes.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <WoodpeakerModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={fetchSessions}
      />
    </div>
  );
}
