
import { memo } from 'react';
import type { PositionStats as PositionStatsType } from '../../hooks/usePositionData';
import { AlertCircle, Trophy, Target } from 'lucide-react';

interface PositionStatsProps {
  stats: PositionStatsType | null;
  loading: boolean;
  error: string | null;
}

const getPercentage = (value: number, total: number) => {
  return total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
}

export const PositionStats = memo(({ stats, loading, error }: PositionStatsProps) => {
  const is404 = error?.includes('404') || error?.includes('not found');

  return (
    <div className="rounded-lg border border-[#33312e] bg-[#262421] p-4 w-64">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[#e0e0e0]">
        <Trophy size={18} className="text-yellow-500" />
        Position Statistics
      </h2>

      {loading && (
        <div className="py-6 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#404040] border-b-emerald-500"></div>
          <p className="mt-2 text-xs text-[#808080]">Loading stats…</p>
        </div>
      )}

      {is404 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 text-amber-400" size={18} />
            <div>
              <h3 className="text-sm font-semibold text-amber-300">Position Not Found</h3>
              <p className="text-xs text-[#b0b0b0]">
                You haven&apos;t reached this position in your games yet.
                Try playing more games or exploring different moves!
              </p>
            </div>
          </div>
        </div>
      )}

      {error && !is404 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 text-red-400" size={18} />
            <div className="text-xs text-[#d0d0d0]">
              <strong>Error:</strong> {error}
            </div>
          </div>
        </div>
      )}

      {stats && !loading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-[#a0a0a0]">
              <Target size={14} />
              Total Games:
            </span>
            <span className="text-xl font-bold text-white">{stats.totalGames}</span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-emerald-400">Wins</span>
                <span className="text-[#d0d0d0]">{stats.wins} ({getPercentage(stats.wins, stats.totalGames)}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#1e1c19]">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${getPercentage(stats.wins, stats.totalGames)}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-zinc-400">Draws</span>
                <span className="text-[#d0d0d0]">{stats.draws} ({getPercentage(stats.draws, stats.totalGames)}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#1e1c19]">
                <div
                  className="h-full bg-zinc-400 transition-all"
                  style={{ width: `${getPercentage(stats.draws, stats.totalGames)}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-red-400">Losses</span>
                <span className="text-[#d0d0d0]">{stats.losses} ({getPercentage(stats.losses, stats.totalGames)}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#1e1c19]">
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${getPercentage(stats.losses, stats.totalGames)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

PositionStats.displayName = 'PositionStats';

