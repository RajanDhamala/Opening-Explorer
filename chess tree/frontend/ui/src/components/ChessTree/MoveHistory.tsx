import { memo, useCallback, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useChessStore, type MoveNode } from '../../stores/useChessStore';
import { GitBranch, ChevronRight } from 'lucide-react';

const MoveHistory = memo(() => {
  const currentNode = useChessStore((state) => state.currentNode);
  const currentMoveIndex = useChessStore((state) => state.currentMoveIndex);
  const goToMove = useChessStore((state) => state.goToMove);
  const selectVariation = useChessStore((state) => state.selectVariation);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store parent node and all its children for variation selection
  const [variationMenu, setVariationMenu] = useState<{
    parentNode: MoveNode;
    currentMoveInPath: string;
    moveIndex: number;
    position: { top: number; left: number };
  } | null>(null);

  // Build FULL path: from root through current position to end of main line
  const getFullPath = useCallback((): { node: MoveNode; isCurrentOrBefore: boolean }[] => {
    const path: { node: MoveNode; isCurrentOrBefore: boolean }[] = [];

    // First, get path from root to current node
    const pathToCurrentNode: MoveNode[] = [];
    let node = currentNode;
    while (node) {
      pathToCurrentNode.unshift(node);
      node = node.parent;
    }

    // Add all nodes up to current with isCurrentOrBefore = true
    for (const n of pathToCurrentNode) {
      path.push({ node: n, isCurrentOrBefore: true });
    }

    // Then continue from current node following first child (main line)
    let futureNode = currentNode?.children[0] || null;
    while (futureNode) {
      path.push({ node: futureNode, isCurrentOrBefore: false });
      futureNode = futureNode.children[0] || null;
    }

    return path;
  }, [currentNode]);

  const handleMoveClick = useCallback((moveIndex: number) => {
    goToMove(moveIndex);
    setVariationMenu(null);
  }, [goToMove]);

  const handleVariationIconClick = useCallback((
    e: ReactMouseEvent,
    parentNode: MoveNode,
    currentMove: string,
    moveIndex: number
  ) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    setVariationMenu({
      parentNode,
      currentMoveInPath: currentMove,
      moveIndex,
      position: {
        top: rect.bottom - (containerRect?.top || 0) + 5,
        left: rect.left - (containerRect?.left || 0)
      }
    });
  }, []);

  const handleVariationSelect = useCallback((childIndex: number) => {
    if (variationMenu) {

      // Go to parent position first
      goToMove(variationMenu.moveIndex + 1);
      // Then select the variation
      setTimeout(() => {
        selectVariation(childIndex);
        setVariationMenu(null);
      }, 10);
    }
  }, [goToMove, selectVariation, variationMenu]);

  // Close menu on position change
  useEffect(() => {
    setVariationMenu(null);
  }, [currentMoveIndex]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (variationMenu && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setVariationMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [variationMenu]);

  const fullPath = getFullPath();

  // Show message if no moves yet
  if (fullPath.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-[#1b1d18] px-3 py-2">
        <h3 className="text-sm font-semibold text-zinc-100">Move History</h3>
        <p className="mt-1 text-sm text-zinc-500">Make a move to start</p>
      </div>
    );
  }

  const rows: {
    moveNumber: number;
    white: { move: string; index: number; node: MoveNode; isFuture: boolean } | null;
    black: { move: string; index: number; node: MoveNode; isFuture: boolean } | null;
  }[] = [];

  for (let i = 0; i < fullPath.length; i++) {
    const { node, isCurrentOrBefore } = fullPath[i];
    const moveNumber = Math.floor(i / 2) + 1;
    const isWhiteMove = i % 2 === 0;

    if (isWhiteMove) {
      rows.push({
        moveNumber,
        white: { move: node.move, index: i, node, isFuture: !isCurrentOrBefore },
        black: null
      });
    } else {
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        lastRow.black = { move: node.move, index: i, node, isFuture: !isCurrentOrBefore };
      }
    }
  }

  // Helper to check if a node has sibling variations
  const hasVariations = (node: MoveNode): boolean => {
    return node.parent !== null && node.parent.children.length > 1;
  };

  const renderMoveCell = (data: { move: string; index: number; node: MoveNode; isFuture: boolean }) => {
    const hasSiblings = hasVariations(data.node);
    const isCurrentMove = currentMoveIndex === data.index;

    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleMoveClick(data.index)}
          className={`rounded px-2 py-1 font-mono text-sm transition-colors ${isCurrentMove
            ? 'bg-emerald-600 text-white ring-1 ring-emerald-300'
            : data.isFuture
              ? 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300'
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
        >
          {data.move}
        </button>

        {hasSiblings && (
          <button
            onClick={(e) => handleVariationIconClick(e, data.node.parent!, data.move, data.index)}
            className="rounded p-1 text-amber-400 transition-colors hover:bg-zinc-800 hover:text-amber-300"
            title={`${data.node.parent!.children.length} variations available`}
          >
            <GitBranch size={14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative rounded-lg border border-zinc-800 bg-[#1b1d18] px-3 py-2" ref={containerRef}>
      {/* Variation selection at top when there are options */}
      {currentNode && currentNode.children.length > 1 && (
        <div className="mb-2 border-b border-zinc-800 pb-2">
          <div className="mb-2 flex items-center gap-1 text-xs text-amber-400">
            <ChevronRight size={12} />
            Choose next move:
          </div>
          <div className="flex flex-wrap gap-2">
            {currentNode.children.map((child, idx) => (
              <button
                key={idx}
                onClick={() => selectVariation(idx)}
                className="rounded bg-amber-500/20 px-3 py-1.5 font-mono text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/30"
              >
                {child.move}
              </button>
            ))}
          </div>
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold text-zinc-100">Move History</h3>

      <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-8 shrink-0 text-right text-zinc-500">{row.moveNumber}.</span>

            {row.white && renderMoveCell(row.white)}
            {row.black && renderMoveCell(row.black)}
          </div>
        ))}
      </div>

      {/* Floating variation menu */}
      {variationMenu && (
        <div
          className="absolute z-50 min-w-[150px] rounded-lg border border-amber-500 bg-zinc-950 p-2 shadow-xl"
          style={{
            top: `${Math.min(variationMenu.position.top, 150)}px`,
            left: `${variationMenu.position.left}px`
          }}
        >
          <div className="mb-2 border-b border-zinc-800 pb-1 text-xs font-semibold text-amber-300">
            Select variation:
          </div>
          {variationMenu.parentNode.children.map((child, idx) => (
            <button
              key={idx}
              onClick={() => handleVariationSelect(idx)}
              className={`mb-1 block w-full rounded px-3 py-1.5 text-left font-mono text-sm transition-colors ${child.move === variationMenu.currentMoveInPath
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-200 hover:bg-zinc-800'
                }`}
            >
              {child.move}
              {child.move === variationMenu.currentMoveInPath && (
                <span className="ml-2 text-xs text-emerald-100">(current)</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

MoveHistory.displayName = 'MoveHistory';

export default MoveHistory;
