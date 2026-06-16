import { memo } from 'react';
import { useChessStore } from '../../stores/useChessStore';

export const ColorSelector = memo(() => {
  const playerColor = useChessStore((state) => state.playerColor);
  const setPlayerColor = useChessStore((state) => state.setPlayerColor);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Color</span>
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
        <button
          onClick={() => setPlayerColor("white")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            playerColor === "white"
              ? 'bg-zinc-100 text-zinc-950'
              : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          White
        </button>
        <button
          onClick={() => setPlayerColor("black")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            playerColor === "black"
              ? 'bg-zinc-800 text-zinc-50 ring-1 ring-zinc-600'
              : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          Black
        </button>
      </div>
    </div>
  );
});

ColorSelector.displayName = 'ColorSelector';
