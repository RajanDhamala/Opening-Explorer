import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Chessboard } from "react-chessboard";
import axios from "axios";
import { useNavigate } from "react-router-dom";
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
  Target,
} from "lucide-react";


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

export default function WoodpeakerPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<WoodpeakerSession[]>([]);
  const [loading, setLoading] = useState(true);

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
                  onClick={() => navigate(`/woodpeaker/${session._id}`, { state: { session } })}
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
