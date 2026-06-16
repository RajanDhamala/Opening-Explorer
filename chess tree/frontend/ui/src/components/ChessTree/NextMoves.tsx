import { memo, useState } from 'react';
import { Trophy, Database, User, Settings } from 'lucide-react';
import type { NextMove as NextMoveType } from '../../hooks/usePositionData';

interface NextMovesProps {
  moves: NextMoveType[];
  loading: boolean;
  onMoveClick: (move: string, fen: string) => void;
}

type Tab = 'masters' | 'lichess' | 'player';

const fmt = (value: number, total: number) =>
  total > 0 ? ((value / total) * 100).toFixed(0) : '0';

const fmtGames = (n: number): string => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};

export const NextMoves = memo(({ moves, loading, onMoveClick }: NextMovesProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('lichess');

  const totalGames = moves.reduce((s, m) => s + m.stats.totalGames, 0);
  const totalWins = moves.reduce((s, m) => s + m.stats.wins, 0);
  const totalDraws = moves.reduce((s, m) => s + m.stats.draws, 0);
  const totalLoss = moves.reduce((s, m) => s + m.stats.losses, 0);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'masters', label: 'Masters', icon: <Trophy size={13} /> },
    { id: 'lichess', label: 'Lichess database', icon: <Database size={13} /> },
    { id: 'player', label: 'Player', icon: <User size={13} /> },
  ];

  return (
    <section
      className="flex flex-col overflow-y-auto rounded border border-[#33312e] bg-[#262421] scrollbar-none"
      style={{ height: '50vh' }}
    >
      <div className="flex items-center border-b border-[#33312e] bg-[#302e2b]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex items-center gap-1.5 border-r border-[#33312e] px-3 py-2 text-xs transition',
              activeTab === tab.id
                ? 'border-b-2 border-b-[#629924] bg-[#262421] text-[#e0e0e0]'
                : 'text-[#707070] hover:text-[#b0b0b0]',
            ].join(' ')}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <button className="ml-auto px-3 py-2 text-[#555] transition hover:text-[#909090]">
          <Settings size={14} />
        </button>
      </div>

      <div className="grid items-center border-b border-[#33312e] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#555]"
        style={{ gridTemplateColumns: '48px 60px 1fr 44px' }}>
        <span>Move</span>
        <span>Games</span>
        <span className="text-center">White / Draw / Black</span>
        <span className="text-right">Black</span>
      </div>

      <div className="flex-1 overflow-y-auto">

        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#3a3835] border-t-[#629924]" />
          </div>
        )}

        {!loading && moves.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-[#555]">
            No moves found in this position
          </p>
        )}

        {!loading && moves.length > 0 && moves.map((move, idx) => {
          const t = move.stats.totalGames || 1;
          const wPct = Number(fmt(move.stats.wins, t));
          const dPct = Number(fmt(move.stats.draws, t));
          const lPct = Number(fmt(move.stats.losses, t));
          const share = totalGames > 0 ? move.stats.totalGames / totalGames : 0;
          const opacity = 0.5 + share * 0.5;

          return (
            <button
              key={`${move.move}-${idx}`}
              onClick={() => onMoveClick(move.move, move.fen)}
              className="group grid w-full items-center border-b border-[#2a2826] px-3 py-[5px] text-left transition last:border-b-0 hover:bg-[#2d2b28]"
              style={{ gridTemplateColumns: '48px 60px 1fr 44px' }}
            >
              <span
                className="font-mono text-sm font-semibold text-[#d0d0d0] transition group-hover:text-[#82b436]"
                style={{ opacity }}
              >
                {move.move}
              </span>

              <span className="text-xs text-[#777]">
                {fmtGames(move.stats.totalGames)}
              </span>

              <div className="flex flex-col gap-[3px] px-1">
                <div className="flex h-[13px] overflow-hidden rounded-[2px] bg-[#1a1917]">
                  <span className="bg-[#c6c4c0]" style={{ width: `${wPct}%` }} />
                  <span className="bg-[#686866]" style={{ width: `${dPct}%` }} />
                  <span
                    className="border-r border-[#444] bg-[#2e2c2a]"
                    style={{ width: `${lPct}%` }}
                  />
                </div>
                <span className="text-center text-[10px] text-[#666]">{wPct}%</span>
              </div>

              {/* Black win % */}
              <span className="text-right font-mono text-xs font-semibold text-[#999]">
                {lPct}%
              </span>
            </button>
          );
        })}
      </div>

      {!loading && moves.length > 0 && (
        <div
          className="grid shrink-0 items-center border-t border-[#33312e] bg-[#1e1c19] px-3 py-1.5"
          style={{ gridTemplateColumns: '48px 60px 1fr 44px' }}
        >
          <span className="font-mono text-base text-[#777]">Σ</span>
          <span className="text-xs text-[#777]">{fmtGames(totalGames)}</span>

          <div className="flex flex-col gap-[3px] px-1">
            <div className="flex h-[13px] overflow-hidden rounded-[2px] bg-[#262421]">
              <span className="bg-[#c6c4c0]" style={{ width: `${fmt(totalWins, totalGames)}%` }} />
              <span className="bg-[#686866]" style={{ width: `${fmt(totalDraws, totalGames)}%` }} />
              <span
                className="border-r border-[#444] bg-[#2e2c2a]"
                style={{ width: `${fmt(totalLoss, totalGames)}%` }}
              />
            </div>
            <span className="text-center text-[10px] font-semibold text-[#888]">
              {fmt(totalWins, totalGames)}%
            </span>
          </div>

          <span className="text-right font-mono text-xs font-semibold text-[#888]">
            {fmt(totalLoss, totalGames)}%
          </span>
        </div>
      )}
    </section>
  );
});

NextMoves.displayName = 'NextMoves';
