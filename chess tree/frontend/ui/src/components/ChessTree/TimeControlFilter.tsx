import { memo } from 'react';
import { Clock3 } from 'lucide-react';
import { useChessStore } from '../../stores/useChessStore';

type TimeClass = "all" | "bullet" | "blitz" | "rapid" | "classical";

interface TimeControlFilterProps {
  timeClassStats?: {
    bullet: number;
    blitz: number;
    rapid: number;
    classical: number;
  };
}

export const TimeControlFilter = memo(({ timeClassStats }: TimeControlFilterProps) => {
  const timeClassFilter = useChessStore((state) => state.timeClassFilter);
  const setTimeClassFilter = useChessStore((state) => state.setTimeClassFilter);

  const options: { value: TimeClass; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'bullet', label: 'Bullet' },
    { value: 'blitz', label: 'Blitz' },
    { value: 'rapid', label: 'Rapid' },
    { value: 'classical', label: 'Classical' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
        <Clock3 size={13} />
        Time
      </span>
      <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
        {options.map(option => {
          const count = option.value === 'all' 
            ? (timeClassStats ? Object.values(timeClassStats).reduce((a, b) => a + b, 0) : 0)
            : (timeClassStats?.[option.value as keyof typeof timeClassStats] || 0);
          
          return (
            <button
              key={option.value}
              onClick={() => setTimeClassFilter(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                timeClassFilter === option.value
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              }`}
            >
              {option.label}
              {timeClassStats && count > 0 && (
                <span className="ml-2 text-xs opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

TimeControlFilter.displayName = 'TimeControlFilter';
