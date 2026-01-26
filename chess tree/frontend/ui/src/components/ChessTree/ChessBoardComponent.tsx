import { memo } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'react-chessboard/dist/chessboard/types';
import { useChessStore } from '../../stores/useChessStore';

interface ChessBoardComponentProps {
  onDrop: (sourceSquare: Square, targetSquare: Square) => boolean;
  onSquareClick: (square: Square) => void;
  onSquareRightClick: (square: Square) => void;
}

export const ChessBoardComponent = memo(({
  onDrop,
  onSquareClick,
  onSquareRightClick,
}: ChessBoardComponentProps) => {
  const fen = useChessStore((state) => state.fen);
  const optionSquares = useChessStore((state) => state.optionSquares);
  const rightClickedSquares = useChessStore((state) => state.rightClickedSquares);
  const boardOrientation = useChessStore((state) => state.boardOrientation);

  return (
    <div className="aspect-square max-w-2xl mx-auto">
      <Chessboard
        position={fen}
        onPieceDrop={onDrop}
        onSquareClick={onSquareClick}
        onSquareRightClick={onSquareRightClick}
        customSquareStyles={{
          ...optionSquares,
          ...rightClickedSquares,
        }}
        boardOrientation={boardOrientation}
        customBoardStyle={{
          borderRadius: '8px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
});

ChessBoardComponent.displayName = 'ChessBoardComponent';
