import { formatScore, scoreToPercent } from "./puzzleUtils";

interface EvalBarProps {
  score: number | null;
  mate: number | null;
  flipped?: boolean;
}

export function EvalBar({ score, mate, flipped = false }: EvalBarProps) {
  const rawPercent = scoreToPercent(score, mate);
  const whitePercent = flipped ? 100 - rawPercent : rawPercent;
  const display = formatScore(score, mate);
  const isWhiteWinning = (score !== null && score > 0) || (mate !== null && mate > 0);

  return (
    <div className="flex flex-col h-full w-7 flex-shrink-0">
      <div className="relative flex-1 bg-[#262421] overflow-hidden">
        {/* Black side (top) */}
        <div
          className="absolute top-0 left-0 right-0 bg-[#403d39] transition-all duration-300"
          style={{ height: `${100 - whitePercent}%` }}
        />
        {/* White side (bottom) */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-[#dadada] transition-all duration-300"
          style={{ height: `${whitePercent}%` }}
        />
      </div>
      {/* Score at bottom */}
      <div
        className={`text-[10px] font-bold text-center py-0.5 ${
          isWhiteWinning ? "bg-[#dadada] text-[#161512]" : "bg-[#403d39] text-[#dadada]"
        }`}
      >
        {display}
      </div>
    </div>
  );
}
