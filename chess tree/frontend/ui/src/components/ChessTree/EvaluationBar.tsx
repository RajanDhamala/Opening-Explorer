import { memo } from 'react';

interface EvaluationBarProps {
  evaluation: number;
  possibleMate: string;
  depth: number;
  bestLine: string;
  isAnalyzing: boolean;
}

export const EvaluationBar = memo(({
  evaluation,
  possibleMate,
  depth,
  bestLine,
  isAnalyzing,
}: EvaluationBarProps) => {
  // Convert evaluation to percentage for the bar (clamped between -10 and +10)
  const clampedEval = Math.max(-10, Math.min(10, evaluation));
  const whitePercentage = possibleMate
    ? (Number(possibleMate) > 0 ? 100 : 0)
    : 50 + (clampedEval / 10) * 50;

  const displayEval = possibleMate
    ? `#${possibleMate}`
    : evaluation >= 0
      ? `+${evaluation.toFixed(1)}`
      : evaluation.toFixed(1);

  return (
    <div className="flex flex-col gap-2">
      {/* Evaluation Bar */}
      <div className="flex items-center gap-3">
        <div className="relative w-6 h-64 bg-zinc-900 rounded-sm overflow-hidden border border-zinc-700">
          {/* White section (bottom) */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-300 ease-out"
            style={{ height: `${whitePercentage}%` }}
          />
          {/* Black section (top) */}
          <div
            className="absolute top-0 left-0 right-0 bg-zinc-800 transition-all duration-300 ease-out"
            style={{ height: `${100 - whitePercentage}%` }}
          />
          {/* Center line */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-500" />
        </div>

        {/* Evaluation text */}
        <div className="flex flex-col">
          <span
            className={`text-lg font-bold ${
              evaluation >= 0 ? 'text-white' : 'text-zinc-400'
            }`}
          >
            {displayEval}
          </span>
          <span className="text-xs text-zinc-500">
            {isAnalyzing ? (
              <span className="flex items-center gap-1">
                <span className="animate-pulse">●</span> Depth {depth}
              </span>
            ) : (
              `Depth ${depth}`
            )}
          </span>
        </div>
      </div>

      {/* Best Line */}
      {bestLine && (
        <div className="bg-zinc-800/50 rounded p-2 text-xs">
          <span className="text-zinc-400">Best: </span>
          <span className="text-green-400 font-mono">
            {bestLine.slice(0, 50)}{bestLine.length > 50 ? '...' : ''}
          </span>
        </div>
      )}
    </div>
  );
});

EvaluationBar.displayName = 'EvaluationBar';
