import type { PuzzleAttempt } from "./puzzleUtils";

interface PuzzleProgressProps {
  attempts: PuzzleAttempt[];
  currentIndex: number;
  total: number;
  onJump: (index: number) => void;
}

export function PuzzleProgress({ attempts, currentIndex, total, onJump }: PuzzleProgressProps) {
  // Build array with results
  const items = Array.from({ length: total }, (_, i) => {
    const attempt = attempts.find((_, idx) => idx === i);
    return {
      index: i,
      result: attempt?.result || null,
      isCurrent: i === currentIndex,
    };
  });

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-[#1a1816] overflow-x-auto">
      {items.map((item) => (
        <button
          key={item.index}
          onClick={() => onJump(item.index)}
          className={`w-5 h-5 rounded-sm flex items-center justify-center text-xs font-bold transition flex-shrink-0 ${
            item.isCurrent
              ? "ring-2 ring-[#3893e8] ring-offset-1 ring-offset-[#161512]"
              : ""
          } ${
            item.result === "correct"
              ? "bg-[#629924] text-white"
              : item.result === "wrong"
              ? "bg-[#cc3333] text-white"
              : "bg-[#3a3836] text-[#8b8987] hover:bg-[#4a4846]"
          }`}
          title={`Puzzle ${item.index + 1}`}
        >
          {item.result === "correct" ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : item.result === "wrong" ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <span className="text-[10px]">{item.isCurrent ? item.index + 1 : ""}</span>
          )}
        </button>
      ))}
    </div>
  );
}
