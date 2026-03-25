interface MoveNavigatorProps {
  moves: string[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  startingMoveNumber?: number;
}

export function MoveNavigator({ moves, currentIndex, onNavigate, startingMoveNumber = 1 }: MoveNavigatorProps) {
  // Group moves in pairs (white, black)
  const movePairs: { moveNum: number; white?: string; black?: string; whiteIdx: number; blackIdx: number }[] = [];
  
  for (let i = 0; i < moves.length; i += 2) {
    const moveNum = startingMoveNumber + Math.floor(i / 2);
    movePairs.push({
      moveNum,
      white: moves[i],
      black: moves[i + 1],
      whiteIdx: i,
      blackIdx: i + 1,
    });
  }

  if (moves.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-sm text-[#6e6c6a]">
        Make a move to begin
      </div>
    );
  }

  return (
    <div className="px-2 py-2">
      <div className="flex flex-wrap gap-x-1 gap-y-0.5 text-sm font-mono">
        {movePairs.map((pair) => (
          <div key={pair.moveNum} className="flex items-center">
            <span className="text-[#6e6c6a] mr-1 text-xs">{pair.moveNum}.</span>
            {pair.white && (
              <button
                onClick={() => onNavigate(pair.whiteIdx)}
                className={`px-1 py-0.5 rounded ${
                  currentIndex === pair.whiteIdx
                    ? "bg-[#629924] text-white"
                    : "text-[#bababa] hover:bg-[#302e2c]"
                }`}
              >
                {pair.white}
              </button>
            )}
            {pair.black && (
              <button
                onClick={() => onNavigate(pair.blackIdx)}
                className={`px-1 py-0.5 rounded ml-1 ${
                  currentIndex === pair.blackIdx
                    ? "bg-[#629924] text-white"
                    : "text-[#bababa] hover:bg-[#302e2c]"
                }`}
              >
                {pair.black}
              </button>
            )}
          </div>
        ))}
      </div>
      
      {/* Navigation controls */}
      <div className="flex items-center justify-center gap-1 mt-3">
        <button
          onClick={() => onNavigate(-1)}
          disabled={currentIndex <= -1}
          className="p-1.5 rounded hover:bg-[#302e2c] disabled:opacity-30 disabled:cursor-not-allowed text-[#bababa]"
          title="First (Home)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => onNavigate(Math.max(-1, currentIndex - 1))}
          disabled={currentIndex <= -1}
          className="p-1.5 rounded hover:bg-[#302e2c] disabled:opacity-30 disabled:cursor-not-allowed text-[#bababa]"
          title="Previous (←)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => onNavigate(Math.min(moves.length - 1, currentIndex + 1))}
          disabled={currentIndex >= moves.length - 1}
          className="p-1.5 rounded hover:bg-[#302e2c] disabled:opacity-30 disabled:cursor-not-allowed text-[#bababa]"
          title="Next (→)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => onNavigate(moves.length - 1)}
          disabled={currentIndex >= moves.length - 1}
          className="p-1.5 rounded hover:bg-[#302e2c] disabled:opacity-30 disabled:cursor-not-allowed text-[#bababa]"
          title="Last (End)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
