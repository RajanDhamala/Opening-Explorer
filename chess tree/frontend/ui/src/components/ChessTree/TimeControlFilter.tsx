import { memo } from 'react';
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

  const options: { value: TimeClass; label: string; icon: string }[] = [
    { value: 'all', label: 'All', icon: '⚡' },
    { value: 'bullet', label: 'Bullet', icon: '🔫' },
    { value: 'blitz', label: 'Blitz', icon: '⚡' },
    { value: 'rapid', label: 'Rapid', icon: '🏃' },
    { value: 'classical', label: 'Classical', icon: '♟️' },
  ];

  return (
    <div className="space-y-2">
      <span className="text-sm text-slate-400">Time Control:</span>
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const count = option.value === 'all' 
            ? (timeClassStats ? Object.values(timeClassStats).reduce((a, b) => a + b, 0) : 0)
            : (timeClassStats?.[option.value as keyof typeof timeClassStats] || 0);
          
          return (
            <button
              key={option.value}
              onClick={() => setTimeClassFilter(option.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                timeClassFilter === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span className="mr-1">{option.icon}</span>
              {option.label}
              {timeClassStats && count > 0 && (
                <span className="ml-2 text-xs opacity-75">({count})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

TimeControlFilter.displayName = 'TimeControlFilter';
