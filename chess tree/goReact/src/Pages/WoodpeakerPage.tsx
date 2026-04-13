import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/lib/utils';
import { Chessboard } from 'react-chessboard';
import {
  X,
  Plus,
  Play,
  Loader2,
  Shuffle,
  RotateCcw,
  Timer,
  ChevronRight,
} from 'lucide-react';

// ── Types & Schema ────────────────────────────────────────────────────────────

const THEMES = [
  { id: 'fork', label: 'Fork' },
  { id: 'pin', label: 'Pin' },
  { id: 'skewer', label: 'Skewer' },
  { id: 'discoveredAttack', label: 'Discovery' },
  { id: 'mateIn1', label: 'Mate in 1' },
  { id: 'mateIn2', label: 'Mate in 2' },
  { id: 'backRankMate', label: 'Back rank' },
  { id: 'endgame', label: 'Endgame' },
  { id: 'deflection', label: 'Deflection' },
  { id: 'sacrifice', label: 'Sacrifice' },
  { id: 'zwischenzug', label: 'Zwischenzug' },
  { id: 'xRayAttack', label: 'X-ray' },
] as const;

const DIFFICULTIES = [
  { id: 'beginner', label: 'Beginner', range: '< 1000', min: 0, max: 999 },
  { id: 'easy', label: 'Easy', range: '1000–1299', min: 1000, max: 1299 },
  { id: 'intermediate', label: 'Intermediate', range: '1300–1599', min: 1300, max: 1599 },
  { id: 'hard', label: 'Hard', range: '1600–1899', min: 1600, max: 1899 },
  { id: 'expert', label: 'Expert', range: '1900–2199', min: 1900, max: 2199 },
  { id: 'master', label: 'Master', range: '2200+', min: 2200, max: 3000 },
  { id: 'mixed', label: 'Mixed', range: '1000–2200', min: 1000, max: 2200 },
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

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        'relative w-10 h-[22px] rounded-full flex-shrink-0 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
        checked ? 'bg-white/80' : 'bg-white/10 hover:bg-white/15'
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] w-4 h-4 rounded-full shadow-sm transition-all duration-200',
          checked ? 'translate-x-[18px] bg-zinc-900' : 'translate-x-0 bg-white/40'
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
}

export function WoodpeakerModal({ open, onClose }: WoodpeakerModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { control, handleSubmit, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      themes: [],
      difficulty: 'mixed',
      count: 25,
      shuffle: true,
      repeatWrong: true,
      showTimer: false,
    },
  });

  const watchedThemes = watch('themes');
  const watchedCount = watch('count');
  const watchedDiff = watch('difficulty');
  const diffCfg = DIFFICULTIES.find(d => d.id === watchedDiff) ?? DIFFICULTIES[6];

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:3030/woodpeaker/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Server error');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const themeLabel =
    watchedThemes.length === 0
      ? 'All themes'
      : watchedThemes.length === 1
        ? THEMES.find(t => t.id === watchedThemes[0])?.label ?? '1 theme'
        : `${watchedThemes.length} themes`;

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Dialog */}
      <div
        className="relative w-full sm:max-w-[480px] rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(160deg, #1c1c1f 0%, #131315 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          maxHeight: '92dvh',
          overflowY: 'auto',
        }}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 sm:px-7 sm:pt-7">
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-tight leading-tight">
              New training set
            </h2>
            <p className="text-[12px] text-white/35 mt-0.5">Woodpecker method</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition-all mt-0.5"
          >
            <X size={14} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px mx-6 sm:mx-7 bg-white/[0.06]" />

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="px-6 sm:px-7 py-6 space-y-7">

            {/* ── Difficulty ── */}
            <div>
              <Label>Difficulty</Label>
              <Controller
                name="difficulty"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-3 gap-1.5">
                    {DIFFICULTIES.map(d => {
                      const active = field.value === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => field.onChange(d.id)}
                          className={cn(
                            'rounded-xl py-2.5 px-2 text-center transition-all duration-150 border',
                            d.id === 'mixed' ? 'col-span-3' : '',
                            active
                              ? 'border-white/25 bg-white/[0.08] text-white'
                              : 'border-white/[0.06] bg-white/[0.02] text-white/35 hover:bg-white/[0.05] hover:text-white/60 hover:border-white/10'
                          )}
                        >
                          <p className={cn('font-medium', d.id === 'mixed' ? 'text-[12px]' : 'text-[11px]')}>
                            {d.label}
                          </p>
                          <p className="text-[10px] opacity-40 mt-0.5">{d.range}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            {/* ── Themes ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Themes</Label>
                <Controller
                  name="themes"
                  control={control}
                  render={({ field }) => (
                    <button
                      type="button"
                      onClick={() => field.onChange([])}
                      className={cn(
                        'text-[10px] font-medium tracking-wide transition-colors -mt-0.5',
                        field.value.length === 0
                          ? 'text-white/70'
                          : 'text-white/25 hover:text-white/50'
                      )}
                    >
                      All
                    </button>
                  )}
                />
              </div>
              <Controller
                name="themes"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-1.5">
                    {THEMES.map(t => {
                      const active = field.value.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            field.onChange(
                              active
                                ? field.value.filter((x: string) => x !== t.id)
                                : [...field.value, t.id]
                            );
                          }}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all duration-150',
                            active
                              ? 'border-white/30 bg-white/[0.09] text-white/90'
                              : 'border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-white/60 hover:border-white/12 hover:bg-white/[0.05]'
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            {/* ── Count ── */}
            <div>
              <Label>Puzzles per cycle</Label>
              <Controller
                name="count"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-4 gap-1.5">
                    {COUNTS.map(n => {
                      const active = field.value === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => field.onChange(n)}
                          className={cn(
                            'rounded-xl py-3 text-sm font-semibold border transition-all duration-150',
                            active
                              ? 'border-white/25 bg-white/[0.08] text-white'
                              : 'border-white/[0.06] bg-white/[0.02] text-white/30 hover:bg-white/[0.05] hover:text-white/60'
                          )}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            {/* ── Options ── */}
            <div>
              <Label>Options</Label>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
                {([
                  {
                    name: 'shuffle' as const,
                    label: 'Shuffle each cycle',
                    sub: 'Randomise puzzle order every round',
                    icon: <Shuffle size={14} className="text-white/40" />,
                  },
                  {
                    name: 'repeatWrong' as const,
                    label: 'Repeat wrong only',
                    sub: 'Core Woodpecker method',
                    icon: <RotateCcw size={14} className="text-white/40" />,
                  },
                  {
                    name: 'showTimer' as const,
                    label: 'Show timer',
                    sub: 'Track time spent per puzzle',
                    icon: <Timer size={14} className="text-white/40" />,
                  },
                ] as const).map(opt => (
                  <Controller
                    key={opt.name}
                    name={opt.name}
                    control={control}
                    render={({ field }) => (
                      <label className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3">
                          {opt.icon}
                          <div>
                            <p className="text-[12px] font-medium text-white/75">{opt.label}</p>
                            <p className="text-[10px] text-white/25 mt-0.5">{opt.sub}</p>
                          </div>
                        </div>
                        <Toggle
                          checked={field.value as boolean}
                          onChange={field.onChange}
                        />
                      </label>
                    )}
                  />
                ))}
              </div>
            </div>

            {/* ── Error ── */}
            {error && (
              <p className="text-[11px] text-red-400/80 text-center bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-2.5">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 flex items-center gap-2 px-6 sm:px-7 py-4 border-t border-white/[0.06]"
            style={{ background: 'linear-gradient(to top, #131315 85%, transparent)' }}
          >
            {/* Summary */}
            <div className="flex-1 text-[10px] text-white/20 leading-relaxed truncate">
              {themeLabel} · {diffCfg.label} ({diffCfg.range}) · {watchedCount} puzzles
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/35 hover:text-white/60 hover:bg-white/[0.05] border border-white/[0.06] transition-all"
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

// A calm, instructive position (Ruy Lopez middlegame) to show on the splash board
const SPLASH_FEN = 'r1bqk2r/pppp1ppp/2n2n2/1B2p3/2b1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4';

export default function WoodpeakerPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">

      {/* ── Subtle noise / grain overlay ── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Ambient glow behind board ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04]"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />

      {/* ── Main content ── */}
      <div className="relative z-10 flex flex-col items-center gap-10 w-full max-w-sm">

        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/20 select-none">
            Tactics training
          </p>
          <h1 className="text-3xl font-bold text-white tracking-tight leading-none">
            Woodpecker
          </h1>
          <p className="text-[13px] text-white/35 leading-relaxed">
            Spaced repetition for chess tactics
          </p>
        </div>

        {/* Chessboard */}
        <div
          className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/[0.07]"
          style={{ maxWidth: 360 }}
        >
          <Chessboard
            position={SPLASH_FEN}
            arePiecesDraggable={false}
            boardWidth={360}
            customDarkSquareStyle={{ backgroundColor: '#3d3d3d' }}
            customLightSquareStyle={{ backgroundColor: '#a8a29e' }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
          {/* Continue */}
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/[0.07] bg-white/[0.04] text-[13px] font-medium text-white/60 hover:bg-white/[0.07] hover:text-white/80 hover:border-white/12 transition-all active:scale-[0.98]"
          >
            <Play size={14} className="opacity-70" />
            Continue
          </button>

          {/* New set */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-zinc-900 text-[13px] font-semibold hover:bg-white/90 transition-all active:scale-[0.98] shadow-lg shadow-black/40"
          >
            <Plus size={14} />
            New set
            <ChevronRight size={13} className="ml-auto opacity-40" />
          </button>
        </div>

        {/* Footer note */}
        <p className="text-[10px] text-white/15 tracking-wide text-center select-none">
          Solve · Repeat · Improve
        </p>
      </div>

      <WoodpeakerModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
