import { memo, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard, type Arrow } from 'swiftchess';
import 'swiftchess/style.css';
import { useChessStore } from '../../stores/useChessStore';

interface ChessBoardComponentProps {
  arrows?: Arrow[];
  onMove: (move: string) => void;
}

export const ChessBoardComponent = memo(({
  arrows = [],
  onMove,
}: ChessBoardComponentProps) => {
  const fen = useChessStore((state) => state.fen);
  const boardOrientation = useChessStore((state) => state.boardOrientation);
  const playerColor = useChessStore((state) => state.playerColor);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const [boardSize] = useState(600);
  const boardGame = useMemo(() => new Chess(fen), [fen]);
  const flipped = boardOrientation === 'black';

  // useLayoutEffect(() => {
  //   const updateBoardSize = () => {
  //     const container = boardWrapRef.current;
  //     if (!container) return;
  //
  //     const availableWidth = container.offsetWidth;
  //     if (availableWidth === 0) return;
  //
  //     // Prefer width so the board uses the full board-column, but cap it
  //     // so it doesn't get absurd. Allowing it to be taller than the viewport
  //     // lets the page scroll rather than forcing a tiny board.
  //     const headerRoom = window.innerWidth >= 1024 ? 140 : 100;
  //     const maxHeight = Math.max(
  //       window.innerHeight - headerRoom,
  //       Math.floor(availableWidth * 1.15)
  //     );
  //
  //     const nextSize = Math.floor(Math.min(availableWidth, maxHeight, 1200));
  //     setBoardSize(Math.max(360, nextSize));
  //   };
  //
  //   // updateBoardSize();
  //
  //   const observer = new ResizeObserver(() => {
  //     requestAnimationFrame(updateBoardSize);
  //   });
  //
  //   if (boardWrapRef.current) observer.observe(boardWrapRef.current);
  //   window.addEventListener('resize', updateBoardSize);
  //
  //   return () => {
  //     observer.disconnect();
  //     window.removeEventListener('resize', updateBoardSize);
  //   };
  // }, []);

  return (
    <div ref={boardWrapRef} className="w-full">
      {boardSize > 0 && (
        <div
          className="mx-auto aspect-square overflow-hidden rounded-sm shadow-[0_24px_80px_rgba(0,0,0,0.4)] ring-1 ring-black/60"
          style={{ width: boardSize, height: boardSize }}
        >
          <ChessBoard
            chess={boardGame}
            position={fen}
            onMove={(move) => onMove(move.san)}
            mode="analysis"
            playerColor={playerColor === 'white' ? 'w' : 'b'}
            flipped={flipped}
            boardSize={boardSize}
            arrows={arrows}
            showLegalMoves
            showStatusBar={false}
            enableSounds={true}
            // showCapturedPieces={true}
            arrowStyle={{
              color: '#16a34a',
              opacity: 0.7,
              widthScale: 0.2,
            }}
            boardThemePreset="custom"
            boardTheme={{ light: '#f0d9b5', dark: '#b58863' }}
          />
        </div>
      )}
    </div>
  );
});

ChessBoardComponent.displayName = 'ChessBoardComponent';
