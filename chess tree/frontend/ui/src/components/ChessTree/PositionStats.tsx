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
};

export const PositionStats = memo(({ stats, loading, error }: PositionStatsProps) => {
  // Check if it's a 404 error
  const is404 = error?.includes('404') || error?.includes('not found');
  
  return (
    <div className="bg-slate-800 rounded-xl shadow-2xl p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Trophy size={20} className="text-yellow-500" />
        Position Statistics
      </h2>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 text-sm">Loading stats...</p>
        </div>
      )}

      {is404 && (
        <div className="bg-amber-900/30 border border-amber-500/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-400 mt-0.5" size={20} />
            <div>
              <h3 className="font-semibold text-amber-300 mb-1">Position Not Found</h3>
              <p className="text-sm text-slate-300">
                You haven't reached this position in your games yet. 
                Try playing more games or exploring different moves!
              </p>
            </div>
          </div>
        </div>
      )}

      {error && !is404 && (
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-400 mt-0.5" size={20} />
            <div className="text-sm">
              <strong>Error:</strong> {error}
            </div>
          </div>
        </div>
      )}

      {stats && !loading && (
        <>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center gap-2">
                <Target size={16} />
                Total Games:
              </span>
              <span className="text-2xl font-bold">{stats.totalGames}</span>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-400">Wins</span>
                  <span>{stats.wins} ({getPercentage(stats.wins, stats.totalGames)}%)</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${getPercentage(stats.wins, stats.totalGames)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Draws</span>
                  <span>{stats.draws} ({getPercentage(stats.draws, stats.totalGames)}%)</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-400 transition-all"
                    style={{ width: `${getPercentage(stats.draws, stats.totalGames)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-red-400">Losses</span>
                  <span>{stats.losses} ({getPercentage(stats.losses, stats.totalGames)}%)</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${getPercentage(stats.losses, stats.totalGames)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

PositionStats.displayName = 'PositionStats';
