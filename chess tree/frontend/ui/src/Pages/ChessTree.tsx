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
      opacity: index === 0 ? 0.7 : 0.5,
      widthScale: index === 0 ? 0.2 : 0.12 + popularity * 0.28,
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


  return (
    <main className="min-h-screen bg-[#161512] text-[#bababa]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 px-3 py-3">
        {/* ── Main grid ──
            board col: fills remaining width so the board can grow
            right col: fixed 400–440px for engine + database + stats
        */}
        <section className="grid flex-1 gap-4 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">

          {/* ── Board column ── */}
          <div className="flex min-w-0 flex-col gap-3">
            {/* Controls bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#33312e] bg-[#262421] px-3 py-2">
              <div className="flex flex-wrap items-center gap-3">
                <ColorSelector />
                <TimeControlFilter timeClassStats={data?.timeClassStats} />
              </div>
              <BoardControls />
            </div>

            {/* Eval bar + board */}
            <div className="grid flex-1 gap-3 mt-28">
              <div className="min-w-0">
                <ChessBoardComponent
                  onMove={(move) => makeMove(move)}
                  arrows={boardArrows}
                />
              </div>
            </div>


            <div className='absolute top-30 flex flex-col space-y-5 '>
              <PositionStats
                stats={data?.stats || null}
                loading={isLoading}
                error={error?.message || null}
              />

              <RecentGames games={data?.recentGames || []} />
            </div>

          </div>

          <aside className="absolute top-40 right-20">
            <NextMoves
              moves={nextMoves}
              loading={isLoading}
              onMoveClick={makeMove}
            />

          </aside>
        </section>
      </div>
    </main>
  );
}
