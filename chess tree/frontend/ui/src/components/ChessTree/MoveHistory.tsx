import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { useChessStore, type MoveNode } from '../../stores/useChessStore';
import { GitBranch, ChevronRight } from 'lucide-react';

const MoveHistory = memo(() => {
  const currentNode = useChessStore((state) => state.currentNode);
  const moveTree = useChessStore((state) => state.moveTree);
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

  const handleMoveClick = useCallback((moveIndex: number, move: any) => {
    console.log("move selected:", move)
    goToMove(moveIndex);
    setVariationMenu(null);
  }, [goToMove]);

  const handleVariationIconClick = useCallback((
    e: React.MouseEvent,
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
    console.log("currentMoveIndex", currentMoveIndex)
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
  if (fullPath.length === 0 && !moveTree) {
    return (
      <div className="mt-4 p-4 bg-slate-700 rounded-lg">
        <h3 className="font-semibold mb-2">Move History</h3>
        <p className="text-slate-400 text-sm">Make a move to start</p>
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
          onClick={() => handleMoveClick(data.index, data.move)}
          className={`px-2 py-1 rounded transition-colors font-mono ${isCurrentMove
            ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-400'
            : data.isFuture
              ? 'bg-slate-500/50 hover:bg-slate-500 text-slate-300'
              : 'bg-slate-600 hover:bg-slate-500'
            }`}
        >
          {data.move}
        </button>

        {hasSiblings && (
          <button
            onClick={(e) => handleVariationIconClick(e, data.node.parent!, data.move, data.index)}
            className="text-amber-400 hover:text-amber-300 transition-colors p-1 rounded hover:bg-slate-600"
            title={`${data.node.parent!.children.length} variations available`}
          >
            <GitBranch size={14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4 p-4 bg-slate-700 rounded-lg relative" ref={containerRef}>
      {/* Variation selection at top when there are options */}
      {currentNode && currentNode.children.length > 1 && (
        <div className="mb-3 pb-3 border-b border-slate-600">
          <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
            <ChevronRight size={12} />
            Choose next move:
          </div>
          <div className="flex flex-wrap gap-2 ">
            {currentNode.children.map((child, idx) => (
              <button
                key={idx}
                onClick={() => selectVariation(idx)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded text-sm font-mono transition-colors font-semibold"
              >
                {child.move}
              </button>
            ))}
          </div>
        </div>
      )}

      <h3 className="font-semibold mb-3">Move History</h3>

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-slate-400 w-8 text-right shrink-0">{row.moveNumber}.</span>

            {row.white && renderMoveCell(row.white)}
            {row.black && renderMoveCell(row.black)}
          </div>
        ))}
      </div>

      {/* Floating variation menu */}
      {variationMenu && (
        <div
          className="absolute z-50 bg-slate-800 border-2 border-amber-500 rounded-lg shadow-xl p-2 min-w-[150px]"
          style={{
            top: `${Math.min(variationMenu.position.top, 150)}px`,
            left: `${variationMenu.position.left}px`
          }}
        >
          <div className="text-xs text-amber-300 mb-2 font-semibold border-b border-slate-600 pb-1">
            Select variation:
          </div>
          {variationMenu.parentNode.children.map((child, idx) => (
            <button
              key={idx}
              onClick={() => handleVariationSelect(idx)}
              className={`block w-full text-left px-3 py-1.5 rounded transition-colors font-mono text-sm mb-1 ${child.move === variationMenu.currentMoveInPath
                ? 'bg-blue-600 text-white'
                : 'hover:bg-slate-600 text-slate-200'
                }`}
            >
              {child.move}
              {child.move === variationMenu.currentMoveInPath && (
                <span className="text-xs ml-2 text-blue-200">(current)</span>
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
