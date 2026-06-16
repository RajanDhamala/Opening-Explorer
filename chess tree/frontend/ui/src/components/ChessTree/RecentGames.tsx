import { memo } from 'react';
import type { GameInfo } from '../../hooks/usePositionData';

interface RecentGamesProps {
  games: GameInfo[];
}

export const RecentGames = memo(({ games }: RecentGamesProps) => {
  if (games.length === 0) return null;

  return (
    <div className="rounded-lg border border-[#33312e] bg-[#262421] p-4">
      <h2 className="mb-3 text-base font-semibold text-[#e0e0e0]">Recent Games</h2>
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {games.map((game, idx) => (
          <a
            key={idx}
            href={game.chessComUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-md border border-[#33312e] bg-[#1e1c19] p-3 transition hover:border-[#505050] hover:bg-[#2a2824]"
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-semibold text-[#d0d0d0]">{game.opponentName}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                game.result === 'win' ? 'bg-emerald-500/20 text-emerald-300' :
                game.result === 'loss' ? 'bg-red-500/20 text-red-300' :
                'bg-zinc-500/20 text-zinc-300'
              }`}>
                {game.result.toUpperCase()}
              </span>
            </div>
            <div className="mt-1 text-xs text-[#808080]">
              Rating: {game.opponentRating}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
});

RecentGames.displayName = 'RecentGames';
