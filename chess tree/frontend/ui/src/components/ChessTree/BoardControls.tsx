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
  const canGoNext =
    (!currentNode && moveTree !== null) ||
    (currentNode !== null && currentNode.children.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={resetBoard}
        className="flex items-center gap-1.5 rounded-md border border-[#404040] bg-[#1e1c19] px-2.5 py-1.5 text-sm font-medium text-[#d0d0d0] transition hover:border-emerald-600/60 hover:text-emerald-400"
        title="Reset to starting position"
      >
        <RotateCcw size={16} />
        Reset
      </button>

      <div className="flex items-center rounded-md border border-[#404040] bg-[#1e1c19] p-0.5">
        <button
          onClick={prevMove}
          disabled={!canGoPrev}
          className="rounded p-1.5 text-[#d0d0d0] transition hover:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-30"
          title="Previous move"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={nextMove}
          disabled={!canGoNext}
          className="rounded p-1.5 text-[#d0d0d0] transition hover:bg-[#2a2824] disabled:cursor-not-allowed disabled:opacity-30"
          title="Next move"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex items-center rounded-md border border-[#404040] bg-[#1e1c19] px-2.5 py-1.5 text-sm text-[#808080]">
        Move: <span className="ml-1 text-[#d0d0d0]">{moveHistory.length}</span>
      </div>

      <button
        onClick={flipBoard}
        className="flex items-center gap-1.5 rounded-md border border-[#404040] bg-[#1e1c19] px-2.5 py-1.5 text-sm text-[#d0d0d0] transition hover:bg-[#2a2824]"
        title="Flip board orientation"
      >
        <Repeat2 size={16} />
        Flip
      </button>
    </div>
  );
});

BoardControls.displayName = 'BoardControls';
