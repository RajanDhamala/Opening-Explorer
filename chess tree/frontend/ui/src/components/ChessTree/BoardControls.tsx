import { memo } from 'react';
import { useChessStore } from '../../stores/useChessStore';
import { RotateCcw, ChevronLeft, ChevronRight, Repeat2 } from 'lucide-react';

export const BoardControls = memo(() => {
  const resetBoard = useChessStore((state) => state.resetBoard);
  const prevMove = useChessStore((state) => state.prevMove);
  const nextMove = useChessStore((state) => state.nextMove);
  const flipBoard = useChessStore((state) => state.flipBoard);
  const currentNode = useChessStore((state) => state.currentNode);
  const moveTree = useChessStore((state) => state.moveTree);
  const moveHistory = useChessStore((state) => state.moveHistory);

  const canGoPrev = currentNode !== null;

  const canGoNext = (!currentNode && moveTree !== null) ||
    (currentNode !== null && currentNode.children.length > 0);

  return (
    <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
      <button
        onClick={resetBoard}
        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
        title="Reset to starting position"
      >
        <RotateCcw size={18} />
        Reset
      </button>

      <button
        onClick={prevMove}
        disabled={!canGoPrev}
        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-30"
        title="Previous move"
      >
        <ChevronLeft size={18} />
        Previous
      </button>

      <button
        onClick={nextMove}
        disabled={!canGoNext}
        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-30"
        title="Next move"
      >
        Next
        <ChevronRight size={18} />
      </button>

      <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400">
        Move: {moveHistory.length > 0 ? moveHistory.length : 0}
      </div>

      <button
        onClick={flipBoard}
        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-600"
        title="Flip board orientation"
      >
        <Repeat2 size={18} />
        Flip Board
      </button>
    </div>
  );
});

BoardControls.displayName = 'BoardControls';
