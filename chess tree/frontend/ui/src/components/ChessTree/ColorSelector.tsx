import { memo } from 'react';
import { useChessStore } from '../../stores/useChessStore';

export const ColorSelector = memo(() => {
  const playerColor = useChessStore((state) => state.playerColor);
  const setPlayerColor = useChessStore((state) => state.setPlayerColor);

  return (
    <div className="flex gap-2 items-center">
      <span className="text-sm text-slate-400">Playing as:</span>
      <div className="flex gap-1 bg-slate-700 rounded-lg p-1">
        <button
          onClick={() => setPlayerColor("white")}
          className={`px-3 py-1 rounded-md text-sm font-medium transition ${
            playerColor === "white"
              ? 'bg-white text-slate-900'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          ♔ White
        </button>
        <button
          onClick={() => setPlayerColor("black")}
          className={`px-3 py-1 rounded-md text-sm font-medium transition ${
            playerColor === "black"
              ? 'bg-slate-900 text-white border border-white'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          ♚ Black
        </button>
      </div>
    </div>
  );
});

ColorSelector.displayName = 'ColorSelector';
