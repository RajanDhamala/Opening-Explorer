import { memo } from 'react';
import type { PVLine } from '../../engine';
import { Activity, Loader2 } from 'lucide-react';

interface EvaluationBarProps {
  evaluation: number;
  possibleMate: string;
  depth: number;
  bestLine: string;
  lines?: PVLine[];
  isAnalyzing: boolean;
  orientation?: 'vertical' | 'horizontal';
}

function formatLine(line: PVLine, index: number) {
  const moves = line.pv.split(' ').slice(0, 8).join(' ');
  const evalText = line.mate
    ? `#${line.mate}`
    : line.scoreCp !== undefined
      ? `${line.scoreCp >= 0 ? '+' : ''}${(line.scoreCp / 100).toFixed(1)}`
      : '0.0';
  return (
    <div
      key={index}
      className="flex items-center gap-2 rounded px-2 py-1 text-xs font-mono text-[#b0b0b0] hover:bg-[#33312e]"
    >
      <span className="w-8 shrink-0 text-[#808080]">{evalText}</span>
      <span className="truncate">{moves}</span>
    </div>
  );
}

export const EvaluationBar = memo(({
  evaluation,
  possibleMate,
  depth,
  bestLine,
  lines = [],
  isAnalyzing,
  orientation = 'vertical',
}: EvaluationBarProps) => {
  const clampedEval = Math.max(-10, Math.min(10, evaluation));
  const whitePercentage = possibleMate
    ? (Number(possibleMate) > 0 ? 100 : 0)
    : 50 + (clampedEval / 10) * 50;

  const displayEval = possibleMate
    ? `#${possibleMate}`
    : evaluation >= 0
      ? `+${evaluation.toFixed(1)}`
      : evaluation.toFixed(1);

  if (orientation === 'horizontal') {
    return (
      <section className="overflow-hidden rounded-lg border border-[#33312e] bg-[#262421]">
        <div className="flex items-center justify-between border-b border-[#33312e] bg-[#2e5c1c]/20 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#e0e0e0]">
            <Activity size={16} className="text-emerald-400" />
            Engine
          </div>
          {isAnalyzing && (
            <Loader2 size={14} className="animate-spin text-emerald-400" />
          )}
        </div>
        <div className="p-3">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className={`text-3xl font-bold ${evaluation >= 0 ? 'text-white' : 'text-zinc-400'}`}>
                {displayEval}
              </div>
              <div className="mt-0.5 text-xs text-[#808080]">
                {isAnalyzing ? `Analyzing… depth ${depth}` : `Depth ${depth || 0}`}
              </div>
            </div>
            {bestLine && (
              <div className="max-w-[60%] text-right">
                <div className="text-[10px] uppercase tracking-wider text-[#808080]">Best line</div>
                <div className="truncate font-mono text-xs text-emerald-300">
                  {bestLine.slice(0, 40)}{bestLine.length > 40 ? '…' : ''}
                </div>
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="space-y-0.5 rounded border border-[#33312e] bg-[#1e1c19] p-2">
              {lines.slice(0, 3).map((line, idx) => formatLine(line, idx))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="relative w-5 flex-1 min-h-[200px] overflow-hidden rounded-sm border border-[#404040] bg-[#1e1c19]">
        <div
          className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-300 ease-out"
          style={{ height: `${whitePercentage}%` }}
        />
        <div
          className="absolute top-0 left-0 right-0 bg-[#33312e] transition-all duration-300 ease-out"
          style={{ height: `${100 - whitePercentage}%` }}
        />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[#555555]" />
      </div>
      <div className="flex flex-col items-center text-center">
        <span className={`text-lg font-bold ${evaluation >= 0 ? 'text-white' : 'text-zinc-400'}`}>
          {displayEval}
        </span>
        <span className="text-[10px] text-[#808080]">
          {isAnalyzing ? (
            <span className="flex items-center gap-1">
              <span className="animate-pulse">●</span> d{depth}
            </span>
          ) : (
            `d${depth || 0}`
          )}
        </span>
      </div>
    </div>
  );
});

EvaluationBar.displayName = 'EvaluationBar';
