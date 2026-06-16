import { memo } from 'react';
import { useChessStore } from '../../stores/useChessStore';

export const ColorSelector = memo(() => {
  const playerColor = useChessStore((state) => state.playerColor);
  const setPlayerColor = useChessStore((state) => state.setPlayerColor);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#808080]">Color</span>
      <div className="flex gap-1 rounded-md border border-[#404040] bg-[#1e1c19] p-0.5">
        <button
          onClick={() => setPlayerColor('white')}
          className={`rounded px-3 py-1 text-sm font-medium transition ${
            playerColor === 'white'
              ? 'bg-zinc-200 text-black'
              : 'text-[#b0b0b0] hover:text-white'
          }`}
        >
          White
        </button>
        <button
          onClick={() => setPlayerColor('black')}
          className={`rounded px-3 py-1 text-sm font-medium transition ${
            playerColor === 'black'
              ? 'bg-[#404040] text-white'
              : 'text-[#b0b0b0] hover:text-white'
          }`}
        >
          Black
        </button>
      </div>
    </div>
  );
});

ColorSelector.displayName = 'ColorSelector';
