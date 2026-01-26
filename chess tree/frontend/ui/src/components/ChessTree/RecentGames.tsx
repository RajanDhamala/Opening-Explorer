import { memo } from 'react';
import type { GameInfo } from '../../hooks/usePositionData';

interface RecentGamesProps {
  games: GameInfo[];
}

export const RecentGames = memo(({ games }: RecentGamesProps) => {
  if (games.length === 0) return null;

  return (
    <div className="bg-slate-800 rounded-xl shadow-2xl p-6">
      <h2 className="text-xl font-bold mb-4">Recent Games</h2>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {games.map((game, idx) => (
          <a
            key={idx}
            href={game.chessComUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold">{game.opponentName}</span>
              <span className={`text-sm px-2 py-1 rounded ${
                game.result === 'win' ? 'bg-green-900 text-green-300' :
                game.result === 'loss' ? 'bg-red-900 text-red-300' :
                'bg-slate-600 text-slate-300'
              }`}>
                {game.result.toUpperCase()}
              </span>
            </div>
            <div className="text-sm text-slate-400 mt-1">
              Rating: {game.opponentRating}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
});

RecentGames.displayName = 'RecentGames';
