import { memo } from 'react';
import { Clock3 } from 'lucide-react';
import { useChessStore } from '../../stores/useChessStore';

type TimeClass = 'all' | 'bullet' | 'blitz' | 'rapid' | 'classical';

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
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#808080]">
        <Clock3 size={13} />
        Time
      </span>
      <div className="flex flex-wrap gap-1 rounded-md border border-[#404040] bg-[#1e1c19] p-0.5">
        {options.map((option) => {
          const count =
            option.value === 'all'
              ? timeClassStats
                ? Object.values(timeClassStats).reduce((a, b) => a + b, 0)
                : 0
              : timeClassStats?.[option.value as keyof typeof timeClassStats] || 0;

          return (
            <button
              key={option.value}
              onClick={() => setTimeClassFilter(option.value)}
              className={`rounded px-2.5 py-1 text-sm font-medium transition ${
                timeClassFilter === option.value
                  ? 'bg-emerald-600 text-white'
                  : 'text-[#b0b0b0] hover:bg-[#2a2824] hover:text-white'
              }`}
            >
              {option.label}
              {timeClassStats && count > 0 && (
                <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

TimeControlFilter.displayName = 'TimeControlFilter';
