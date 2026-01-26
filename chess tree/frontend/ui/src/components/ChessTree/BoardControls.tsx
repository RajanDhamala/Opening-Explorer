import { memo } from 'react';
import { useChessStore } from '../../stores/useChessStore';
import { RotateCcw, ChevronLeft, ChevronRight, Repeat2 } from 'lucide-react';

export const BoardControls = memo(() => {
  const resetBoard = useChessStore((state) => state.resetBoard);
  const prevMove = useChessStore((state) => state.prevMove);
  const nextMove = useChessStore((state) => state.nextMove);
  const flipBoard = useChessStore((state) => state.flipBoard);
  const moveHistory = useChessStore((state) => state.moveHistory);
  const currentMoveIndex = useChessStore((state) => state.currentMoveIndex);

  return (
    <div className="mt-4 flex gap-2 justify-center flex-wrap">
      <button
        onClick={resetBoard}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition font-semibold flex items-center gap-2"
        title="Reset to starting position"
      >
        <RotateCcw size={18} />
        Reset
      </button>

      <button
        onClick={prevMove}
        disabled={currentMoveIndex < 0}
        className="px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition flex items-center gap-2"
        title="Previous move"
      >
        <ChevronLeft size={18} />
        Previous
      </button>

      <button
        onClick={nextMove}
        disabled={currentMoveIndex >= moveHistory.length - 1}
        className="px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition flex items-center gap-2"
        title="Next move"
      >
        Next
        <ChevronRight size={18} />
      </button>

      <div className="px-3 py-2 bg-slate-700 rounded-lg text-sm flex items-center">
        Move: {currentMoveIndex + 1}/{moveHistory.length || 0}
      </div>

      <button
        onClick={flipBoard}
        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition flex items-center gap-2"
        title="Flip board orientation"
      >
        <Repeat2 size={18} />
        Flip Board
      </button>
    </div>
  );
});

BoardControls.displayName = 'BoardControls';
