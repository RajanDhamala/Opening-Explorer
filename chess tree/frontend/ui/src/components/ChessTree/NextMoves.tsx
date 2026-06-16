import { memo } from 'react';
import type { NextMove as NextMoveType } from '../../hooks/usePositionData';
import { Database } from 'lucide-react';

interface NextMovesProps {
  moves: NextMoveType[];
  loading: boolean;
  onMoveClick: (move: string, fen: string) => void;
}

const getPercentage = (value: number, total: number) => {
  return total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
};

const getWinRateColor = (winRate: number) => {
  if (winRate >= 60) return 'text-green-400';
  if (winRate >= 45) return 'text-yellow-400';
  return 'text-red-400';
};

export const NextMoves = memo(({ moves, loading, onMoveClick }: NextMovesProps) => {
  const totalBranchGames = moves.reduce((sum, move) => sum + move.stats.totalGames, 0);

  const getResultBar = (move: NextMoveType) => {
    const total = move.stats.totalGames || 1;
    return {
      wins: (move.stats.wins / total) * 100,
      draws: (move.stats.draws / total) * 100,
      losses: (move.stats.losses / total) * 100,
    };
  };

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-[#1b1d18] shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-[#2e5c1c] px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Database size={16} className="text-zinc-100" />
          Player database
        </h2>
        {moves.length > 0 && !loading && (
          <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-xs text-zinc-200">
            {moves.length} lines
          </span>
        )}
      </div>

      {loading && (
        <div className="py-10 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-b-emerald-400"></div>
        </div>
      )}

      {moves.length === 0 && !loading && (
        <p className="px-4 py-10 text-center text-sm text-zinc-500">
          No moves found in this position
        </p>
      )}

      {moves.length > 0 && !loading && (
        <div>
          <div className="grid grid-cols-[64px_60px_1fr] items-center gap-2 border-b border-zinc-800 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            <span>Move</span>
            <span>Games</span>
            <span>Win / Draw / Loss</span>
          </div>
          {moves.map((move, idx) => {
            const winRate = parseFloat(getPercentage(move.stats.wins, move.stats.totalGames));
            const share = totalBranchGames > 0 ? move.stats.totalGames / totalBranchGames : 0;
            const bar = getResultBar(move);
            return (
              <button
                key={`${move.move}-${move.fen}-${idx}`}
                onClick={() => onMoveClick(move.move, move.fen)}
                className="group grid w-full grid-cols-[64px_60px_1fr] items-center gap-2 border-b border-zinc-800/70 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[#262821]"
              >
                <span
                  className="font-mono text-base font-semibold text-zinc-100 transition group-hover:text-emerald-300"
                  style={{ opacity: 0.58 + share * 0.42 }}
                >
                  {move.move}
                </span>
                <span className="text-xs text-zinc-400">
                  {move.stats.totalGames}
                </span>
                <span className="min-w-0 space-y-1">
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className={getWinRateColor(winRate)}>{winRate}% win</span>
                    <span className="text-zinc-500">{getPercentage(move.stats.totalGames, totalBranchGames)}%</span>
                  </span>
                  <span className="flex h-4 overflow-hidden rounded-full bg-zinc-900 shadow-inner">
                    <span
                      className="bg-zinc-200"
                      style={{ width: `${bar.wins}%` }}
                    />
                    <span
                      className="bg-zinc-500"
                      style={{ width: `${bar.draws}%` }}
                    />
                    <span
                      className="bg-zinc-800"
                      style={{ width: `${bar.losses}%` }}
                    />
                  </span>
                  <span className="grid grid-cols-3 gap-1 text-[11px] leading-none">
                    <span className="text-zinc-200">W {move.stats.wins}</span>
                    <span className="text-zinc-500">D {move.stats.draws}</span>
                    <span className="text-zinc-400">L {move.stats.losses}</span>
                  </span>
                  <span className="block h-1 overflow-hidden rounded-full bg-zinc-900/80">
                    <span
                      className="block h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.max(3, share * 100)}%`, opacity: 0.35 + share * 0.65 }}
                    />
                  </span>
                </span>
              </button>
            );
          })}
          <div className="grid grid-cols-[64px_60px_1fr] items-center gap-2 border-t border-zinc-800 bg-[#22241e] px-3 py-2 text-xs text-zinc-300">
            <span className="font-mono">Σ</span>
            <span>{totalBranchGames}</span>
            <span className="min-w-0">
              <span className="flex h-4 overflow-hidden rounded-full bg-zinc-900">
                <span className="bg-zinc-200" style={{ width: `${getPercentage(moves.reduce((sum, move) => sum + move.stats.wins, 0), totalBranchGames)}%` }} />
                <span className="bg-zinc-500" style={{ width: `${getPercentage(moves.reduce((sum, move) => sum + move.stats.draws, 0), totalBranchGames)}%` }} />
                <span className="bg-zinc-800" style={{ width: `${getPercentage(moves.reduce((sum, move) => sum + move.stats.losses, 0), totalBranchGames)}%` }} />
              </span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
});

NextMoves.displayName = 'NextMoves';
