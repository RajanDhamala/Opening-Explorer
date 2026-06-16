import { useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import type { Arrow } from 'swiftchess';
import { Activity, Database, GitBranch, Loader2 } from 'lucide-react';
import { useChessStore } from '../stores/useChessStore';
import { usePositionData, type NextMove as NextMoveType } from '../hooks/usePositionData';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { useStockfish } from '../hooks/useStockfish';
import { ChessBoardComponent } from '../components/ChessTree/ChessBoardComponent';
import { BoardControls } from '../components/ChessTree/BoardControls';
import MoveHistory from '@/components/ChessTree/MoveHistory';
import { PositionStats } from '../components/ChessTree/PositionStats';
import { NextMoves } from '../components/ChessTree/NextMoves';
import { RecentGames } from '../components/ChessTree/RecentGames';
import { ColorSelector } from '../components/ChessTree/ColorSelector';
import { TimeControlFilter } from '../components/ChessTree/TimeControlFilter';
import { EvaluationBar } from '../components/ChessTree/EvaluationBar';

function normalizeFen(fen: string) {
  return fen.split(' ').slice(0, 4).join(' ');
}

function getMoveArrow(currentFen: string, nextMove: NextMoveType, maxGames: number, index: number): Arrow | null {
  try {
    const chess = new Chess(currentFen);
    const move = chess.move(nextMove.move);
    if (!move) return null;

    const derivedFen = normalizeFen(chess.fen());
    const apiFen = normalizeFen(nextMove.fen);
    if (derivedFen !== apiFen) return null;

    const popularity = maxGames > 0 ? nextMove.stats.totalGames / maxGames : 0;
    return {
      from: move.from,
      to: move.to,
      color: index === 0 ? 'rgb(16,185,129)' : 'rgb(245,158,11)',
      opacity: Math.min(0.9, 0.18 + popularity * 0.72),
      widthScale: Math.min(1.4, 0.68 + popularity * 0.62),
    };
  } catch {
    return null;
  }
}

function getBestMoveArrow(bestMove?: string | null): Arrow | null {
  if (!bestMove || bestMove.length < 4) return null;

  return {
    from: bestMove.substring(0, 2),
    to: bestMove.substring(2, 4),
    color: 'rgb(56,189,248)',
    opacity: 0.74,
    widthScale: 0.92,
  };
}

export default function ChessTree() {
  const game = useChessStore((state) => state.game);
  const fen = useChessStore((state) => state.fen);
  const playerColor = useChessStore((state) => state.playerColor);
  const timeClassFilter = useChessStore((state) => state.timeClassFilter);
  const moveHistory = useChessStore((state) => state.moveHistory);
  const addMove = useChessStore((state) => state.addMove);

  const { data, isLoading, error } = usePositionData(
    fen,
    playerColor,
    timeClassFilter !== 'all' ? timeClassFilter : undefined
  );

  const isGameOver = game.isGameOver() || game.isDraw();
  const { evaluation, isAnalyzing } = useStockfish(fen, game.turn(), isGameOver);

  useKeyboardNavigation();

  const nextMoves = data?.nextMoves || [];
  const totalGames = data?.stats?.totalGames || 0;
  const maxBranchGames = Math.max(...nextMoves.map((move) => move.stats.totalGames), 1);

  const branchArrows = useMemo(() => {
    return nextMoves
      .slice(0, 8)
      .map((move, index) => getMoveArrow(fen, move, maxBranchGames, index))
      .filter((arrow): arrow is Arrow => Boolean(arrow));
  }, [fen, maxBranchGames, nextMoves]);

  const boardArrows = useMemo(() => {
    const bestArrow = getBestMoveArrow(evaluation.bestMove);
    return bestArrow ? [...branchArrows, bestArrow] : branchArrows;
  }, [branchArrows, evaluation.bestMove]);

  const makeMove = useCallback((moveStr: string, targetFen?: string) => {
    try {
      addMove(moveStr, targetFen);
      return true;
    } catch {
      return false;
    }
  }, [addMove]);

  const winRate = totalGames > 0 && data?.stats
    ? ((data.stats.wins / totalGames) * 100).toFixed(1)
    : '0.0';

  return (
    <main className="min-h-screen bg-[#11130f] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-3 px-3 py-3 sm:px-4 lg:px-5">

        {/* ── Header ── */}
        <header className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-[#171915] px-3 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.24)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10">
              <GitBranch size={18} className="text-emerald-300" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Chess Tree</h1>
              <p className="truncate text-sm text-zinc-500">
                {moveHistory.length > 0 ? moveHistory.join(' ') : 'Starting position'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Games</div>
              <div className="text-base font-semibold text-zinc-100">{totalGames}</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Win rate</div>
              <div className="text-base font-semibold text-emerald-300">{winRate}%</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                <Activity size={12} />
                Engine
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                {isAnalyzing && <Loader2 size={14} className="animate-spin text-sky-300" />}
                depth {evaluation.depth || 0}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                <Database size={12} />
                Branches
              </div>
              <div className="text-sm font-medium text-amber-300">{nextMoves.length}</div>
            </div>
          </div>
        </header>

        {/* ── Main 3-column grid ──
            board col: takes remaining space (min 0, no fixed max so it breathes)
            moves col: fixed 340px — enough for the player-database table
            stats col: fixed 240px — position stats + recent games
        */}
        <section className="grid min-h-0 flex-1 gap-4
          lg:grid-cols-[minmax(0,1fr)_340px]
          xl:grid-cols-[minmax(0,1fr)_340px_240px]
          xl:items-start">

          {/* ── Board column ── */}
          <div className="min-w-0">
            {/* Controls bar */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-[#171915] px-3 py-2">
              <div className="flex flex-wrap gap-2">
                <ColorSelector />
                <TimeControlFilter timeClassStats={data?.timeClassStats} />
              </div>
              <BoardControls />
            </div>

            {/* Eval bar + board side by side */}
            <div className="grid gap-3 lg:grid-cols-[72px_minmax(0,1fr)]">
              <div className="hidden lg:block">
                <EvaluationBar
                  evaluation={evaluation.positionEvaluation}
                  possibleMate={evaluation.possibleMate}
                  depth={evaluation.depth}
                  bestLine={evaluation.bestLine}
                  isAnalyzing={isAnalyzing}
                />
              </div>

              <div className="min-w-0">
                <ChessBoardComponent
                  onMove={(move) => makeMove(move)}
                  arrows={boardArrows}
                />
                <div className="mt-3">
                  <MoveHistory />
                </div>
              </div>
            </div>
          </div>

          {/* ── Player database / Next moves column ── */}
          <aside className="min-w-0 space-y-3">
            <NextMoves
              moves={nextMoves}
              loading={isLoading}
              onMoveClick={makeMove}
            />
            {/* Eval bar on mobile/tablet (below board) */}
            <div className="lg:hidden">
              <EvaluationBar
                evaluation={evaluation.positionEvaluation}
                possibleMate={evaluation.possibleMate}
                depth={evaluation.depth}
                bestLine={evaluation.bestLine}
                isAnalyzing={isAnalyzing}
              />
            </div>
          </aside>

          {/* ── Stats + Recent games column ── */}
          <aside className="min-w-0 space-y-3 lg:col-span-2 xl:col-span-1">
            <PositionStats
              stats={data?.stats || null}
              loading={isLoading}
              error={error?.message || null}
            />
            <RecentGames games={data?.recentGames || []} />
          </aside>
        </section>
      </div>
    </main>
  );
}
