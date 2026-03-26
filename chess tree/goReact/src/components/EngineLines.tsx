import type { EngineLine } from "./puzzleUtils";
import { formatScore } from "./puzzleUtils";

interface EngineLinesProps {
  lines: EngineLine[];
  isAnalyzing: boolean;
  depth: number;
  onLineClick?: (lineIdx: number) => void;
  onAnalyze?: () => void;
  enabled: boolean;
  onToggle: () => void;
}

// Skeleton loading animation
function LineSkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-2 py-1.5">
      <div className="w-12 h-4 bg-[#3a3836] rounded" />
      <div className="flex-1 h-4 bg-[#3a3836] rounded" />
    </div>
  );
}

export function EngineLines({ lines, isAnalyzing, depth, onLineClick, onAnalyze, enabled, onToggle }: EngineLinesProps) {
  if (!enabled) {
    return (
      <div className="border-t border-[#3a3836]">
        <button
          onClick={onToggle}
          className="w-full py-2.5 text-sm text-[#8b8987] hover:text-[#bababa] hover:bg-[#302e2c] transition flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Enable engine analysis
        </button>
      </div>
    );
  }

  // Show skeleton if analyzing and no lines yet, OR if lines array has gaps
  const showSkeleton = isAnalyzing && lines.length < 3;

  return (
    <div className="border-t border-[#3a3836]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#262421]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#629924]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-xs text-[#8b8987]">Stockfish 16</span>
          {isAnalyzing ? (
            <span className="text-xs text-[#629924] animate-pulse">
              {depth > 0 ? `depth ${depth}` : "starting..."}
            </span>
          ) : depth > 0 ? (
            <span className="text-xs text-[#6e6c6a]">
              depth {depth}
            </span>
          ) : null}
        </div>
        <button
          onClick={onToggle}
          className="text-xs text-[#8b8987] hover:text-[#bababa]"
        >
          ✕
        </button>
      </div>

      {/* Lines */}
      <div className="px-3 py-1 space-y-0.5 bg-[#1a1816]">
        {lines.length === 0 && isAnalyzing ? (
          <>
            <LineSkeleton />
            <LineSkeleton />
            <LineSkeleton />
          </>
        ) : (
          <>
            {lines.map((line, idx) => (
              <button
                key={idx}
                onClick={() => onLineClick?.(idx)}
                className="w-full flex items-start gap-2 py-1 px-1 rounded hover:bg-[#302e2c] transition text-left group"
              >
                <span
                  className={`text-xs font-mono font-semibold min-w-[48px] ${
                    (line.score !== null && line.score > 0) || (line.mate !== null && line.mate > 0)
                      ? "text-[#bababa]"
                      : "text-[#8b8987]"
                  }`}
                >
                  {formatScore(line.score, line.mate)}
                </span>
                <span className="text-xs text-[#bababa] font-mono truncate flex-1 group-hover:text-white">
                  {line.pvSan.slice(0, 8).join(" ")}
                  {line.pvSan.length > 8 && "..."}
                </span>
              </button>
            ))}
            {/* Show remaining skeletons while loading more lines */}
            {showSkeleton && Array.from({ length: 3 - lines.length }).map((_, i) => (
              <LineSkeleton key={`skeleton-${i}`} />
            ))}
          </>
        )}
        {/* Clickable button to start analysis when idle */}
        {!isAnalyzing && lines.length === 0 && (
          <button
            onClick={onAnalyze}
            className="w-full text-xs text-[#629924] hover:text-[#7ab82f] py-2 text-center transition hover:bg-[#302e2c] rounded"
          >
            ▶ Click to analyze position
          </button>
        )}
      </div>
    </div>
  );
}
