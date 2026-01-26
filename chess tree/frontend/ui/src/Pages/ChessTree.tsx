import { useCallback } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'react-chessboard/dist/chessboard/types';
import { useChessStore } from '../stores/useChessStore';
import { usePositionData } from '../hooks/usePositionData';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { ChessBoardComponent } from '../components/ChessTree/ChessBoardComponent';
import { BoardControls } from '../components/ChessTree/BoardControls';
import MoveHistory from '@/components/ChessTree/MoveHistory';
import { PositionStats } from '../components/ChessTree/PositionStats';
import { NextMoves } from '../components/ChessTree/NextMoves';
import { RecentGames } from '../components/ChessTree/RecentGames';
import { ColorSelector } from '../components/ChessTree/ColorSelector';
import { TimeControlFilter } from '../components/ChessTree/TimeControlFilter';

export default function ChessTree() {
  const game = useChessStore((state) => state.game);
  const fen = useChessStore((state) => state.fen);
  const moveFrom = useChessStore((state) => state.moveFrom);
  const rightClickedSquares = useChessStore((state) => state.rightClickedSquares);
  const playerColor = useChessStore((state) => state.playerColor);
  const timeClassFilter = useChessStore((state) => state.timeClassFilter);

  const addMove = useChessStore((state) => state.addMove);
  const setMoveFrom = useChessStore((state) => state.setMoveFrom);
  const setOptionSquares = useChessStore((state) => state.setOptionSquares);
  const setRightClickedSquares = useChessStore((state) => state.setRightClickedSquares);

  const { data, isLoading, error } = usePositionData(
    fen,
    playerColor,
    timeClassFilter !== 'all' ? timeClassFilter : undefined
  );

  useKeyboardNavigation();

  const makeMove = useCallback((moveStr: string) => {
    try {
      addMove(moveStr);
      return true;
    } catch {
      return false;
    }
  }, [addMove]);

  const onDrop = useCallback((sourceSquare: Square, targetSquare: Square) => {
    const gameCopy = new Chess(game.fen());

    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (move) {
        addMove(move.san);
        setMoveFrom(null);
        setOptionSquares({});
        return true;
      }
    } catch (err) {
      console.log('Invalid move');
    }

    return false;
  }, [game, addMove, setMoveFrom, setOptionSquares]);

  const getMoveOptions = useCallback((square: Square) => {
    const moves = game.moves({
      square,
      verbose: true,
    });

    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, { background: string; borderRadius?: string }> = {};
    moves.forEach((move) => {
      const piece = game.get(move.to as Square);
      newSquares[move.to] = {
        background:
          piece && piece.type !== 'p'
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });
    newSquares[square] = {
      background: 'rgba(255, 255, 0, 0.4)',
    };
    setOptionSquares(newSquares);
    return true;
  }, [game, setOptionSquares]);

  const onSquareClick = useCallback((square: Square) => {
    if (!moveFrom) {
      const hasMoveOptions = getMoveOptions(square);
      if (hasMoveOptions) setMoveFrom(square);
      return;
    }

    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({
        from: moveFrom,
        to: square,
        promotion: 'q',
      });

      if (move) {
        addMove(move.san);
        setMoveFrom(null);
        setOptionSquares({});
        return;
      }
    } catch (err) {
      const hasMoveOptions = getMoveOptions(square);
      setMoveFrom(hasMoveOptions ? square : null);
    }
  }, [moveFrom, game, getMoveOptions, setMoveFrom, addMove, setOptionSquares]);

  const onSquareRightClick = useCallback((square: Square) => {
    const color = 'rgba(0, 0, 255, 0.4)';
    setRightClickedSquares({
      ...rightClickedSquares,
      [square]:
        rightClickedSquares[square] &&
          rightClickedSquares[square].backgroundColor === color
          ? { backgroundColor: 'transparent' }
          : { backgroundColor: color },
    });
  }, [rightClickedSquares, setRightClickedSquares]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
            Chess Opening Tree
          </h1>
          <p className="text-slate-400">
            Explore your opening repertoire - Use arrow keys ← → to navigate moves
          </p>
        </div>

        {/* Filters Section */}
        <div className="mb-6 bg-slate-800 rounded-xl shadow-2xl p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <ColorSelector />
            <TimeControlFilter timeClassStats={data?.timeClassStats} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6">
              <ChessBoardComponent
                onDrop={onDrop}
                onSquareClick={onSquareClick}
                onSquareRightClick={onSquareRightClick}
              />

              <BoardControls />
              <div>move history</div>
              <MoveHistory />
            </div>
          </div>

          <div className="space-y-6">
            <PositionStats
              stats={data?.stats || null}
              loading={isLoading}
              error={error?.message || null}
            />

            <NextMoves
              moves={data?.nextMoves || []}
              loading={isLoading}
              onMoveClick={makeMove}
            />

            <RecentGames games={data?.recentGames || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
