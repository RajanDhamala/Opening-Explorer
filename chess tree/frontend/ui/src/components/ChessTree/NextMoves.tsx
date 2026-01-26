import { memo } from 'react';
import type { NextMove as NextMoveType } from '../../hooks/usePositionData';
import { ChevronRight, TrendingUp } from 'lucide-react';

interface NextMovesProps {
  moves: NextMoveType[];
  loading: boolean;
  onMoveClick: (move: string) => void;
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
  return (
    <div className="bg-slate-800 rounded-xl shadow-2xl p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <TrendingUp size={20} className="text-blue-400" />
        Available Moves
      </h2>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      )}

      {moves.length === 0 && !loading && (
        <p className="text-slate-400 text-sm text-center py-4">
          No moves found in this position
        </p>
      )}

      {moves.length > 0 && !loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-2 text-slate-400 font-semibold">Move</th>
                <th className="text-right py-2 px-2 text-slate-400 font-semibold">Games</th>
                <th className="text-right py-2 px-2 text-slate-400 font-semibold">W</th>
                <th className="text-right py-2 px-2 text-slate-400 font-semibold">D</th>
                <th className="text-right py-2 px-2 text-slate-400 font-semibold">L</th>
                <th className="text-right py-2 px-2 text-slate-400 font-semibold">Win%</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {moves.map((move, idx) => {
                const winRate = parseFloat(getPercentage(move.stats.wins, move.stats.totalGames));
                return (
                  <tr
                    key={idx}
                    onClick={() => onMoveClick(move.move)}
                    className="border-b border-slate-700/50 hover:bg-slate-700/50 cursor-pointer transition group"
                  >
                    <td className="py-3 px-2">
                      <span className="font-mono font-bold text-base group-hover:text-blue-400 transition">
                        {move.move}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-slate-300">
                      {move.stats.totalGames}
                    </td>
                    <td className="py-3 px-2 text-right text-green-400">
                      {move.stats.wins}
                    </td>
                    <td className="py-3 px-2 text-right text-slate-400">
                      {move.stats.draws}
                    </td>
                    <td className="py-3 px-2 text-right text-red-400">
                      {move.stats.losses}
                    </td>
                    <td className={`py-3 px-2 text-right font-semibold ${getWinRateColor(winRate)}`}>
                      {winRate}%
                    </td>
                    <td className="py-3 px-2">
                      <ChevronRight 
                        size={16} 
                        className="text-slate-500 group-hover:text-blue-400 transition" 
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

NextMoves.displayName = 'NextMoves';
