import { memo, useCallback, useState, useEffect } from 'react';
import { useChessStore, type MoveNode } from '../../stores/useChessStore';
import { GitBranch } from 'lucide-react';

interface MoveTableRow {
  moveNumber: number;
  white: { 
    move: string; 
    moveIndex: number; 
    variations: string[];
    node: MoveNode | null 
  } | null;
  black: { 
    move: string; 
    moveIndex: number; 
    variations: string[];
    node: MoveNode | null 
  } | null;
}

const MoveHistory = memo(() => {
  const moveHistory = useChessStore((state) => state.moveHistory);
  const moveTree = useChessStore((state) => state.moveTree);
  const currentMoveIndex = useChessStore((state) => state.currentMoveIndex);
  const goToMove = useChessStore((state) => state.goToMove);
  const selectVariation = useChessStore((state) => state.selectVariation);
  
  const [showVariationMenu, setShowVariationMenu] = useState<{ moveIndex: number; variations: string[] } | null>(null);

  // Build table from move history
  const buildMoveTable = useCallback((): MoveTableRow[] => {
    const rows: MoveTableRow[] = [];
    
    // Build map of moves to nodes for variation detection
    const moveToNode = new Map<number, MoveNode>();
    if (moveTree) {
      let node: MoveNode | null = moveTree;
      let idx = 0;
      moveToNode.set(idx, node);
      
      // Follow main line
      while (node && node.children.length > 0) {
        node = node.children[0];
        idx++;
        moveToNode.set(idx, node);
      }
    }
    
    for (let i = 0; i < moveHistory.length; i++) {
      const moveNumber = Math.floor(i / 2) + 1;
      const isWhiteMove = i % 2 === 0;
      const node = moveToNode.get(i);
      
      // Get variations (other children of parent)
      const variations: string[] = [];
      if (node?.parent) {
        node.parent.children.forEach(child => {
          if (child.move !== node.move) {
            variations.push(child.move);
          }
        });
      }
      
      if (isWhiteMove) {
        rows.push({
          moveNumber,
          white: {
            move: moveHistory[i],
            moveIndex: i,
            variations,
            node: node || null
          },
          black: null
        });
      } else {
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
          lastRow.black = {
            move: moveHistory[i],
            moveIndex: i,
            variations,
            node: node || null
          };
        }
      }
    }
    
    return rows;
  }, [moveHistory, moveTree]);

  const handleMoveClick = useCallback((moveIndex: number) => {
    goToMove(moveIndex);
    setShowVariationMenu(null);
  }, [goToMove]);

  const handleVariationClick = useCallback((moveIndex: number, variations: string[]) => {
    if (variations.length > 0) {
      setShowVariationMenu({ moveIndex, variations });
    }
  }, []);

  const handleVariationSelect = useCallback((variation: string, moveIndex: number) => {
    // Go to parent position
    goToMove(moveIndex - 1);
    // Find the variation index
    setTimeout(() => {
      const node = moveTree;
      if (node) {
        let current: MoveNode | null = node;
        for (let i = 0; i < moveIndex - 1 && current; i++) {
          current = current.children[0];
        }
        if (current) {
          const varIndex = current.children.findIndex(c => c.move === variation);
          if (varIndex >= 0) {
            selectVariation(varIndex);
          }
        }
      }
      setShowVariationMenu(null);
    }, 10);
  }, [goToMove, selectVariation, moveTree]);

  // Auto-close variation menu when current position changes
  useEffect(() => {
    setShowVariationMenu(null);
  }, [currentMoveIndex]);

  const moveTable = buildMoveTable();
  
  if (moveTable.length === 0) return null;

  return (
    <div className="mt-4 p-4 bg-slate-700 rounded-lg">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <span>Move History</span>
      </h3>
      
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {moveTable.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-slate-400 w-8 text-right shrink-0">{row.moveNumber}.</span>
            
            {/* White's move */}
            {row.white && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleMoveClick(row.white!.moveIndex)}
                  className={`px-2 py-1 rounded transition-colors font-mono ${
                    currentMoveIndex === row.white!.moveIndex
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-slate-600 hover:bg-slate-500'
                  }`}
                >
                  {row.white.move}
                </button>
                
                {/* Show variations inline */}
                {row.white.variations.length > 0 && (
                  <div className="flex items-center gap-1 relative">
                    <span className="text-slate-500 text-xs">(</span>
                    <button
                      onClick={() => handleVariationClick(row.white!.moveIndex, row.white!.variations)}
                      className="text-amber-400 hover:text-amber-300 transition-colors p-0.5"
                      title="Click to select variation"
                    >
                      <GitBranch size={12} />
                    </button>
                    <span className="text-slate-400 text-xs font-mono">
                      {row.white.variations.join(', ')}
                    </span>
                    <span className="text-slate-500 text-xs">)</span>
                    
                    {/* Variation menu */}
                    {showVariationMenu?.moveIndex === row.white.moveIndex && (
                      <div className="absolute left-0 top-6 z-10 bg-slate-800 border border-amber-500 rounded shadow-lg p-2 min-w-[100px]">
                        <div className="text-xs text-amber-300 mb-1 font-semibold">Select:</div>
                        {showVariationMenu.variations.map((variation, varIdx) => (
                          <button
                            key={varIdx}
                            onClick={() => handleVariationSelect(variation, row.white!.moveIndex)}
                            className="block w-full text-left px-2 py-1 rounded hover:bg-slate-600 transition-colors font-mono text-sm"
                          >
                            {variation}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Black's move */}
            {row.black && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleMoveClick(row.black!.moveIndex)}
                  className={`px-2 py-1 rounded transition-colors font-mono ${
                    currentMoveIndex === row.black!.moveIndex
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-slate-600 hover:bg-slate-500'
                  }`}
                >
                  {row.black.move}
                </button>
                
                {/* Show variations inline */}
                {row.black.variations.length > 0 && (
                  <div className="flex items-center gap-1 relative">
                    <span className="text-slate-500 text-xs">(</span>
                    <button
                      onClick={() => handleVariationClick(row.black!.moveIndex, row.black!.variations)}
                      className="text-amber-400 hover:text-amber-300 transition-colors p-0.5"
                      title="Click to select variation"
                    >
                      <GitBranch size={12} />
                    </button>
                    <span className="text-slate-400 text-xs font-mono">
                      {row.black.variations.join(', ')}
                    </span>
                    <span className="text-slate-500 text-xs">)</span>
                    
                    {/* Variation menu */}
                    {showVariationMenu?.moveIndex === row.black.moveIndex && (
                      <div className="absolute left-0 top-6 z-10 bg-slate-800 border border-amber-500 rounded shadow-lg p-2 min-w-[100px]">
                        <div className="text-xs text-amber-300 mb-1 font-semibold">Select:</div>
                        {showVariationMenu.variations.map((variation, varIdx) => (
                          <button
                            key={varIdx}
                            onClick={() => handleVariationSelect(variation, row.black!.moveIndex)}
                            className="block w-full text-left px-2 py-1 rounded hover:bg-slate-600 transition-colors font-mono text-sm"
                          >
                            {variation}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

MoveHistory.displayName = 'MoveHistory';

export default MoveHistory;
