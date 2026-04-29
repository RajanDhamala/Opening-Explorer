import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Chessboard } from "react-chessboard";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart2,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Target,
  Timer,
  Trash2,
  X,
  Zap,
} from "lucide-react";


const THEMES = [
  { id: "opening", label: "Opening" },
  { id: "middlegame", label: "Middlegame" },
  { id: "endgame", label: "Endgame" },
  { id: "rookEndgame", label: "Rook Endgame" },
  { id: "bishopEndgame", label: "Bishop Endgame" },
  { id: "pawnEndgame", label: "Pawn Endgame" },
  { id: "knightEndgame", label: "Knight Endgame" },
  { id: "queenEndgame", label: "Queen Endgame" },
  { id: "queenRookEndgame", label: "Queen & Rook Endgame" },
  { id: "discoveredAttack", label: "Discovered Attack" },
  { id: "doubleCheck", label: "Double Check" },
  { id: "fork", label: "Fork" },
  { id: "kingsideAttack", label: "Kingside Attack" },
  { id: "pin", label: "Pin" },
  { id: "queensideAttack", label: "Queenside Attack" },
  { id: "sacrifice", label: "Sacrifice" },
  { id: "skewer", label: "Skewer" },
  { id: "trappedPiece", label: "Trapped Piece" },
  { id: "attraction", label: "Attraction" },
  { id: "defensiveMove", label: "Defensive Move" },
  { id: "deflection", label: "Deflection" },
  { id: "intermezzo", label: "Intermezzo" },
  { id: "xRayAttack", label: "X-Ray Attack" },
  { id: "mate", label: "Checkmate" },
  { id: "mateIn1", label: "Mate in 1" },
  { id: "mateIn2", label: "Mate in 2" },
  { id: "mateIn3", label: "Mate in 3" },
  { id: "mateIn4", label: "Mate in 4" },
  { id: "mateIn5", label: "Mate in 5+" },
  { id: "backRankMate", label: "Back Rank Mate" },
  { id: "smotheredMate", label: "Smothered Mate" },
  { id: "castling", label: "Castling" },
  { id: "underPromotion", label: "Underpromotion" },
  { id: "equality", label: "Equality" },
  { id: "advantage", label: "Advantage" },
  { id: "crushing", label: "Crushing" },
  { id: "oneMove", label: "One-move" },
  { id: "short", label: "Short (2 moves)" },
  { id: "long", label: "Long (3 moves)" },
  { id: "veryLong", label: "Very Long (4+ moves)" },
  { id: "master", label: "Master Games" },
  { id: "masterVsMaster", label: "Master vs Master" },
  { id: "superGM", label: "Super GM" },
] as const;

const DIFFICULTIES = [
  { id: "beginner", label: "Beginner", range: "< 1000", min: 0, max: 999 },
  { id: "easy", label: "Easy", range: "1000–1299", min: 1000, max: 1299 },
  { id: "intermediate", label: "Intermediate", range: "1300–1599", min: 1300, max: 1599 },
  { id: "hard", label: "Hard", range: "1600–1899", min: 1600, max: 1899 },
  { id: "expert", label: "Expert", range: "1900–2199", min: 1900, max: 2199 },
  { id: "master", label: "Master", range: "2200+", min: 2200, max: 3000 },
  { id: "mixed", label: "Mixed", range: "All ratings", min: 1000, max: 2200 },
] as const;

const COUNTS = [10, 25, 50, 100] as const;
const TABS = ["Setup", "Themes", "Options"] as const;
type Tab = (typeof TABS)[number];


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
  solvedpuzzles?: number;
  status: string;
  updatedat: string;
  themes: string[];
  minrating: number;
  maxrating: number;
  createdat: string;
}


function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "relative w-11 h-6 rounded-full flex-shrink-0 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        checked ? "bg-white" : "bg-zinc-700 hover:bg-zinc-600",
      )}
    >
      <span
        className={cn(
          "absolute top-[4px] left-[4px] w-4 h-4 rounded-full shadow-md transition-all duration-200",
          checked ? "translate-x-5 bg-zinc-900" : "translate-x-0 bg-zinc-500",
        )}
      />
    </button>
  );
}


function RenameModal({
  session,
  onClose,
  onSuccess,
}: {
  session: WoodpeakerSession;
  onClose: () => void;
  onSuccess: (id: string, newTitle: string) => void;
}) {
  const [value, setValue] = useState(session.title || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = async () => {
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await axios.patch(
        `http://localhost:3030/woodpeaker/rename`,
        {
          title: value.trim(),
          sessionId: session._id,
        },
        { withCredentials: true },
      );
      onSuccess(session._id, value.trim());
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to rename. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/70 p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Pencil size={14} className="text-zinc-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Rename Session</h3>
            <p className="text-xs text-zinc-600">Give this set a new name</p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onClose();
          }}
          className="w-full rounded-xl bg-zinc-950 border border-zinc-800 text-sm px-4 py-3.5 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent transition-all mb-2"
          placeholder="e.g. Endgame Focus"
        />
        {error && <p className="text-xs text-red-400 mt-2 mb-3">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!value.trim() || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-white text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}


function DeleteModal({
  session,
  onClose,
  onSuccess,
}: {
  session: WoodpeakerSession;
  onClose: () => void;
  onSuccess: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`http://localhost:3030/woodpeaker/delList/${session._id}`, { withCredentials: true });
      onSuccess(session._id);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to delete. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/70 p-7">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={17} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-1.5">Delete Session</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">
              You're about to delete{" "}
              <span className="text-zinc-200 font-semibold">"{session.title || "this session"}"</span>.
              This cannot be undone.
            </p>
          </div>
        </div>
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({
  session,
  onNavigate,
  onRename,
  onDelete,
}: {
  session: WoodpeakerSession;
  onNavigate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const progress =
    session.solvedpuzzles !== undefined
      ? Math.round((session.solvedpuzzles / session.totalpuzzles) * 100)
      : null;

  const statusMeta =
    session.status === "completed"
      ? { label: "Completed", cls: "text-emerald-400 bg-emerald-400/10 border-emerald-500/25" }
      : session.status === "active"
        ? { label: "In Progress", cls: "text-sky-400 bg-sky-400/10 border-sky-500/25" }
        : { label: session.status, cls: "text-zinc-500 bg-zinc-800/80 border-zinc-700/50" };

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="group relative bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl transition-all duration-200 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5 overflow-hidden flex flex-col">

      {/* Top accent line on hover */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-600 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Card body */}
      <div className="p-6 flex flex-col gap-5 flex-1">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
            <h3 className="text-base font-bold text-zinc-100 group-hover:text-white transition-colors leading-snug truncate">
              {session.title || "Untitled Session"}
            </h3>
            <p className="text-xs text-zinc-700 mt-1.5 tabular-nums">
              {new Date(session.createdat).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {/* 3-dot menu */}
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((p) => !p); }}
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded-lg text-zinc-700 hover:text-zinc-300 hover:bg-zinc-800 transition-all",
                menuOpen && "bg-zinc-800 text-zinc-300",
              )}
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-20 w-44 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl shadow-black/60 overflow-hidden py-1.5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors text-left"
                >
                  <Pencil size={13} />
                  Rename
                </button>
                <div className="h-px bg-zinc-800/80 mx-2 my-1" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:text-red-400 hover:bg-red-500/8 transition-colors text-left"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2.5 cursor-pointer" onClick={onNavigate}>
          <div className="flex items-center gap-3 bg-zinc-800/50 rounded-xl px-3.5 py-3">
            <Target size={13} className="text-zinc-600 shrink-0" />
            <div>
              <p className="text-[10px] text-zinc-600 leading-none mb-1 font-medium uppercase tracking-wider">Puzzles</p>
              <p className="text-sm font-bold text-zinc-200 tabular-nums leading-none">{session.totalpuzzles}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-zinc-800/50 rounded-xl px-3.5 py-3">
            <BarChart2 size={13} className="text-zinc-600 shrink-0" />
            <div>
              <p className="text-[10px] text-zinc-600 leading-none mb-1 font-medium uppercase tracking-wider">Rating</p>
              <p className="text-sm font-bold text-zinc-200 tabular-nums leading-none">{session.minrating}–{session.maxrating}</p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {progress !== null && (
          <div className="cursor-pointer" onClick={onNavigate}>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-zinc-600 font-medium">Progress</p>
              <p className="text-xs text-zinc-500 tabular-nums">{progress}%</p>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Themes + status row */}
        <div className="flex items-center justify-between gap-3 mt-auto cursor-pointer" onClick={onNavigate}>
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {session.themes?.slice(0, 3).map((theme) => (
              <span
                key={theme}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700/60"
              >
                {theme}
              </span>
            ))}
            {session.themes?.length > 3 && (
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700/60">
                +{session.themes.length - 3}
              </span>
            )}
            {(!session.themes || session.themes.length === 0) && (
              <span className="text-xs text-zinc-700">All themes</span>
            )}
          </div>
          <span className={cn("shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border", statusMeta.cls)}>
            {statusMeta.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ──────────────────────────────────────────────────────────────

interface WoodpeakerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function WoodpeakerModal({ open, onClose, onSuccess }: WoodpeakerModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Setup");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

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
  const allSelected = watchedThemes.length === THEMES.length;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await axios.post(
        "http://localhost:3030/woodpeaker/init",
        { ...data, title },
        { withCredentials: true },
      );
      if (res.status === 200 || res.status === 201) {
        onSuccess?.();
        onClose();
      } else throw new Error("Server error");
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Something went wrong");
      setActiveTab("Setup");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const tabIndex = TABS.indexOf(activeTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/80 flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-lg shadow-white/10">
              <Zap size={16} className="text-zinc-900" fill="currentColor" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight">New Training Set</h2>
              <p className="text-xs text-zinc-600 mt-0.5">Woodpecker spaced repetition</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-600 hover:text-white hover:bg-zinc-800 transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center border-b border-zinc-800 px-7 shrink-0 bg-zinc-950">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative px-4 py-4 text-sm font-semibold transition-all select-none",
                activeTab === tab ? "text-white" : "text-zinc-600 hover:text-zinc-400",
              )}
            >
              {tab}
              {tab === "Themes" && watchedThemes.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-zinc-800 text-zinc-400 tabular-nums">
                  {watchedThemes.length}
                </span>
              )}
              {activeTab === tab && (
                <span className="absolute bottom-0 inset-x-4 h-0.5 bg-white rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-7 py-7 space-y-7">

            {error && (
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* ── SETUP ── */}
            {activeTab === "Setup" && (
              <div className="space-y-7">
                {/* Title */}
                <div>
                  <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-zinc-600 mb-3">Session Title</p>
                  <input
                    type="text"
                    placeholder="e.g. Endgame Mastery, Fork Drills, Daily Tactics…"
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-800 text-sm px-4 py-3.5 text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent transition-all"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Count */}
                <div>
                  <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-zinc-600 mb-3">Number of Puzzles</p>
                  <div className="grid grid-cols-4 gap-3">
                    {COUNTS.map((c) => {
                      const active = watchedCount === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setValue("count", c)}
                          className={cn(
                            "py-4 rounded-xl text-sm font-bold transition-all duration-150 border",
                            active
                              ? "bg-white text-zinc-900 border-transparent shadow-lg"
                              : "bg-zinc-900 text-zinc-600 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300",
                          )}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-zinc-600">Difficulty</p>
                    <span className="text-xs text-zinc-700 tabular-nums">{diffCfg.range} ELO</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {DIFFICULTIES.map((d) => {
                      const active = watchedDiff === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setValue("difficulty", d.id)}
                          className={cn(
                            "px-4 py-3.5 rounded-xl text-left border transition-all duration-150",
                            active
                              ? "bg-zinc-800 border-zinc-600 text-white"
                              : "bg-zinc-900 border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-300",
                          )}
                        >
                          <span className="block text-sm font-bold leading-none">{d.label}</span>
                          <span className="block text-[11px] mt-1.5 text-zinc-600 tabular-nums">{d.range}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── THEMES ── */}
            {activeTab === "Themes" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-zinc-600">Pick Themes</p>
                  <button
                    type="button"
                    onClick={() => setValue("themes", allSelected ? [] : THEMES.map((t) => t.id))}
                    className="text-xs font-semibold text-zinc-600 hover:text-white transition-colors"
                  >
                    {allSelected ? "Clear all" : "Select all"}
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
                          if (active)
                            setValue("themes", watchedThemes.filter((id) => id !== t.id));
                          else setValue("themes", [...watchedThemes, t.id]);
                        }}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-150",
                          active
                            ? "bg-zinc-800 border-zinc-600 text-white"
                            : "bg-transparent border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400",
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-5 text-xs text-zinc-700 text-center">
                  {watchedThemes.length === 0
                    ? "No filter — all puzzle types included"
                    : `${watchedThemes.length} theme${watchedThemes.length !== 1 ? "s" : ""} selected`}
                </p>
              </div>
            )}

            {/* ── OPTIONS ── */}
            {activeTab === "Options" && (
              <div>
                <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-zinc-600 mb-4">Advanced Settings</p>
                <div className="space-y-2">
                  {[
                    {
                      name: "shuffle" as const,
                      label: "Shuffle Puzzles",
                      sub: "Randomize the order every session",
                      icon: <Shuffle size={15} className="text-zinc-500" />,
                    },
                    {
                      name: "repeatWrong" as const,
                      label: "Repeat Incorrect",
                      sub: "Queue failed puzzles again until solved",
                      icon: <RotateCcw size={15} className="text-zinc-500" />,
                    },
                    {
                      name: "showTimer" as const,
                      label: "Show Timer",
                      sub: "Display elapsed time per puzzle",
                      icon: <Timer size={15} className="text-zinc-500" />,
                    },
                  ].map((opt) => (
                    <div
                      key={opt.name}
                      onClick={() => setValue(opt.name, !watch(opt.name))}
                      className="flex items-center justify-between px-5 py-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-xl bg-zinc-800 group-hover:bg-zinc-700/80 flex items-center justify-center transition-colors shrink-0">
                          {opt.icon}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-200 leading-none">{opt.label}</p>
                          <p className="text-xs text-zinc-600 mt-1.5">{opt.sub}</p>
                        </div>
                      </div>
                      <Toggle checked={watch(opt.name)} onChange={(v) => setValue(opt.name, v)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="shrink-0 flex items-center justify-between px-7 py-5 border-t border-zinc-800 bg-zinc-950">
            {/* Step dots */}
            <div className="flex items-center gap-2">
              {TABS.map((tab, i) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "rounded-full transition-all duration-200",
                    activeTab === tab
                      ? "w-5 h-1.5 bg-white"
                      : i < tabIndex
                        ? "w-1.5 h-1.5 bg-zinc-600"
                        : "w-1.5 h-1.5 bg-zinc-800 hover:bg-zinc-700",
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 hover:text-white hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              {activeTab !== "Options" ? (
                <button
                  type="button"
                  onClick={() => setActiveTab(TABS[tabIndex + 1])}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold bg-zinc-800 text-white hover:bg-zinc-700 transition-all active:scale-[0.98] border border-zinc-700"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-white text-zinc-900 hover:bg-zinc-100 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-black/20"
                >
                  {submitting ? (
                    <><Loader2 size={13} className="animate-spin" />Starting…</>
                  ) : (
                    <><Play size={12} className="fill-zinc-900" />Start Training</>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const SPLASH_FEN = "r1bqk2r/pppp1ppp/2n2n2/1B2p3/2b1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4";
const LICHESS_LIGHT = "#f0d9b5";
const LICHESS_DARK = "#b58863";

export default function WoodpeakerPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<WoodpeakerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameTarget, setRenameTarget] = useState<WoodpeakerSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WoodpeakerSession | null>(null);

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

  const handleRenameSuccess = (id: string, newTitle: string) => {
    setSessions((prev) => prev.map((s) => (s._id === id ? { ...s, title: newTitle } : s)));
  };

  const handleDeleteSuccess = (id: string) => {
    setSessions((prev) => prev.filter((s) => s._id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Subtle chess grid texture */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.012]"
        style={{
          backgroundImage: "repeating-conic-gradient(#ffffff 0% 25%, transparent 0% 50%)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Glow at top */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 inset-x-0 h-[500px]"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% -5%, rgba(255,255,255,0.04) 0%, transparent 80%)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 lg:px-10 pt-14 pb-24">

        {/* ── Hero ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-12">
          <div className="flex items-center gap-6">
            <div className="w-[84px] h-[84px] rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-zinc-800 shrink-0 hidden sm:block">
              <Chessboard
                options={{
                  position: SPLASH_FEN,
                  allowDragging: false,
                  boardStyle: { width: "84px", height: "84px" },
                  darkSquareStyle: { backgroundColor: LICHESS_DARK },
                  lightSquareStyle: { backgroundColor: LICHESS_LIGHT },
                }}
              />
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.25em] uppercase text-zinc-700 mb-2.5 select-none">
                Tactics Training
              </p>
              <h1 className="text-[2.25rem] font-black text-white tracking-tighter leading-none mb-3">
                Woodpecker Method
              </h1>
              <p className="text-sm text-zinc-500 leading-relaxed max-w-sm">
                Build pattern recognition through spaced repetition. Drill, fail, repeat — until tactics become instinct.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-white text-zinc-900 text-sm font-black hover:bg-zinc-100 active:scale-[0.97] transition-all shadow-xl shadow-black/30 tracking-tight"
          >
            <Plus size={15} strokeWidth={2.5} />
            New Set
          </button>
        </div>

        {/* ── Stats strip ── */}
        {!loading && sessions.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-10">
            {[
              { label: "Total Sets", value: sessions.length },
              { label: "Total Puzzles", value: sessions.reduce((a, s) => a + s.totalpuzzles, 0).toLocaleString() },
              { label: "Active", value: sessions.filter((s) => s.status === "active").length },
            ].map((stat) => (
              <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600 mb-2">{stat.label}</p>
                <p className="text-2xl font-black text-white tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Sessions ── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600">Your Sessions</p>
            {!loading && sessions.length > 0 && (
              <span className="text-xs text-zinc-700 tabular-nums">{sessions.length} total</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="animate-spin text-zinc-700 w-6 h-6" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 border border-dashed border-zinc-800 rounded-2xl">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
                <Target size={22} className="text-zinc-700" />
              </div>
              <h3 className="text-sm font-bold text-zinc-500 mb-2">No sessions yet</h3>
              <p className="text-sm text-zinc-700 text-center max-w-xs mb-8 leading-relaxed">
                Create your first training set and start building tactical instincts.
              </p>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-sm font-bold transition-all"
              >
                <Plus size={14} />
                Create your first set
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sessions.map((session) => (
                <SessionCard
                  key={session._id}
                  session={session}
                  onNavigate={() => navigate(`/woodpeaker/${session._id}`, { state: { session } })}
                  onRename={() => setRenameTarget(session)}
                  onDelete={() => setDeleteTarget(session)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      <WoodpeakerModal open={open} onClose={() => setOpen(false)} onSuccess={fetchSessions} />
      {renameTarget && (
        <RenameModal
          session={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSuccess={handleRenameSuccess}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          session={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
