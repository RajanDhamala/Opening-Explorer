"use client"

import { ScrollText, ChevronRight } from "lucide-react"
import { useState, useEffect, useRef } from "react"

export default function MoveHistory({ moves, currentMoveIndex, onMoveClick }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const scrollRef = useRef(null)
  const movePairs = []
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null,
      whiteIndex: i,
      blackIndex: i + 1,
    })
  }

  const isActiveMove = (index) =>
    currentMoveIndex !== undefined && currentMoveIndex === index

  const handleMoveClick = (index) => {
    if (onMoveClick) onMoveClick(index)
  }

  // 👇 Auto-scroll to bottom when new moves are added
  // useEffect(() => {
  //   if (scrollRef.current) {
  //     scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  //   }
  // }, [moves])

  return (
    <div className="bg-slate-800/40 rounded-lg border border-slate-700/50 flex flex-col overflow-hidden h-[200px]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/60">
        <ScrollText className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Move History</h2>
        <div className="ml-auto text-xs text-slate-500 font-mono">
          {moves.length > 0 ? `${Math.ceil(moves.length / 2)} moves` : ""}
        </div>
      </div>

      {/* Moves List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar"
      >
        {moves.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-12 h-12 rounded-full bg-slate-700/30 flex items-center justify-center mb-3">
              <ScrollText className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-slate-500 text-sm font-medium">No moves yet</p>
            <p className="text-slate-600 text-xs mt-1">Game will start soon</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {movePairs.map((pair) => (
              <div
                key={pair.number}
                className="flex gap-2 items-center group"
                onMouseEnter={() => setHoveredIndex(pair.number)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Move Number */}
                <span className="text-xs text-slate-400 font-bold min-w-7 text-right">
                  {pair.number}.
                </span>

                {/* White Move */}
                <button
                  onClick={() => handleMoveClick(pair.whiteIndex)}
                  className={`
                    flex-1 px-3 py-2 rounded text-sm font-mono 
                    transition-all duration-150
                    ${isActiveMove(pair.whiteIndex)
                      ? "bg-blue-600/80 text-white ring-2 ring-blue-500/50 shadow-lg"
                      : "bg-slate-700/50 text-slate-100 hover:bg-slate-600/70"}
                    ${hoveredIndex === pair.number && !isActiveMove(pair.whiteIndex)
                      ? "ring-1 ring-slate-500/30"
                      : ""}
                  `}
                >
                  {pair.white}
                </button>

                {/* Black Move */}
                {pair.black ? (
                  <button
                    onClick={() => handleMoveClick(pair.blackIndex)}
                    className={`
                      flex-1 px-3 py-2 rounded text-sm font-mono
                      transition-all duration-150
                      ${isActiveMove(pair.blackIndex)
                        ? "bg-blue-600/80 text-white ring-2 ring-blue-500/50 shadow-lg"
                        : "bg-slate-600/40 text-slate-200 hover:bg-slate-500/60"}
                      ${hoveredIndex === pair.number && !isActiveMove(pair.blackIndex)
                        ? "ring-1 ring-slate-500/30"
                        : ""}
                    `}
                  >
                    {pair.black}
                  </button>
                ) : (
                  <div className="flex-1 px-3 py-2 rounded bg-slate-700/20 border border-dashed border-slate-600/40 flex items-center justify-center">
                    <ChevronRight className="w-3 h-3 text-slate-600 animate-pulse" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.7);
        }
      `}</style>
    </div>
  )
}
