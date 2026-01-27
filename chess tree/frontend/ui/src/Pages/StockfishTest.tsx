import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'react-chessboard/dist/chessboard/types';
import Engine from '../engine';

export default function StockfishTest() {
  const engine = useMemo(() => new Engine(), []);
  const chessGameRef = useRef(new Chess());
  const chessGame = chessGameRef.current;

  const [chessPosition, setChessPosition] = useState(chessGame.fen());
  const [positionEvaluation, setPositionEvaluation] = useState(0);
  const [depth, setDepth] = useState(0);
  const [bestLine, setBestLine] = useState('');
  const [possibleMate, setPossibleMate] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [topLines, setTopLines] = useState<Array<{ multipv: number; pv: string; scoreCp?: number; mate?: number }>>([]);

  const randomFens = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r1bqkbnr/pppp1ppp/2n5/4p3/8/5NP1/PPPPPPBP/RNBQK2R w KQkq - 2 4",
    "rnbq1rk1/pppp1ppp/4pn2/8/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 2 6",
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 6"
  ];

  useEffect(() => {
    const fen = randomFens[Math.floor(Math.random() * randomFens.length)];
    chessGame.load(fen);
    setChessPosition(chessGame.fen());
  }, []);

  useEffect(() => {
    if (chessGame.isGameOver() || chessGame.isDraw()) return;

    setIsAnalyzing(true);
    engine.evaluatePosition(chessGame.fen(), 3000, 30); // 3s search, depth 30

    engine.onMessage(({ lines, bestMove: engineBest, uciMessage }) => {
      if (!lines || lines.length === 0) return;

      // Take top PV line as "best line"
      const topLine = lines[0];
      setBestLine(topLine.pv);

      // Evaluation in pawns
      if (topLine.mate !== undefined) {
        setPositionEvaluation(topLine.mate > 0 ? 100 : -100); // special flag for mate
        setPossibleMate(String(topLine.mate));
      } else if (topLine.scoreCp !== undefined) {
        const evalScore = (chessGame.turn() === 'w' ? 1 : -1) * topLine.scoreCp / 100;
        setPositionEvaluation(evalScore);
        setPossibleMate('');
      }

      // Depth of analysis
      if (topLine.depth) setDepth(topLine.depth);

      // Store all top lines for display
      setTopLines(lines.map(l => ({
        multipv: l.multipv,
        pv: l.pv,
        scoreCp: l.scoreCp,
        mate: l.mate
      })));

      setIsAnalyzing(false);

      // Optional: log all lines
      console.log('Top lines:');
      lines.forEach(line => {
        console.log(
          `#${line.multipv} [depth ${line.depth}] ${line.pv} eval: ${line.mate !== undefined ? '#' + line.mate : line.scoreCp
          }`
        );
      });
    });
  }, [chessPosition, engine, chessGame]);

  function onPieceDrop(sourceSquare: Square, targetSquare: Square) {
    try {
      const move = chessGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });
      if (move) {
        engine.stop();
        setBestLine('');
        setPossibleMate('');
        setDepth(0);
        setChessPosition(chessGame.fen());
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  // Convert UCI move (e.g., "e2e4") to SAN (e.g., "e4") using a temp Chess instance
  const uciToSan = (fen: string, uciMove: string): string => {
    try {
      const tempGame = new Chess(fen);
      const from = uciMove.substring(0, 2) as Square;
      const to = uciMove.substring(2, 4) as Square;
      const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
      const move = tempGame.move({ from, to, promotion });
      return move ? move.san : uciMove;
    } catch {
      return uciMove;
    }
  };

  // Convert a line of UCI moves to SAN notation
  const uciLineToSan = (fen: string, uciLine: string): string => {
    const moves = uciLine.split(' ');
    const tempGame = new Chess(fen);
    const sanMoves: string[] = [];
    for (const uci of moves) {
      try {
        const from = uci.substring(0, 2) as Square;
        const to = uci.substring(2, 4) as Square;
        const promotion = uci.length > 4 ? uci[4] : undefined;
        const move = tempGame.move({ from, to, promotion });
        if (move) sanMoves.push(move.san);
        else break;
      } catch {
        break;
      }
    }
    return sanMoves.join(' ');
  };

  // Play first move of a line
  const playLineMove = (uciLine: string) => {
    const firstMove = uciLine.split(' ')[0];
    if (!firstMove || firstMove.length < 4) return;
    const from = firstMove.substring(0, 2) as Square;
    const to = firstMove.substring(2, 4) as Square;
    const promotion = firstMove.length > 4 ? firstMove[4] : undefined;
    try {
      const move = chessGame.move({ from, to, promotion });
      if (move) {
        engine.stop();
        setBestLine('');
        setPossibleMate('');
        setDepth(0);
        setTopLines([]);
        setChessPosition(chessGame.fen());
      }
    } catch {}
  };

  const bestMove = bestLine?.split(' ')[0];
  const bestMoveSan = bestMove ? uciToSan(chessPosition, bestMove) : '-';

  // Evaluation bar calculation
  const clampedEval = Math.max(-10, Math.min(10, positionEvaluation));
  const whitePercentage = possibleMate
    ? (Number(possibleMate) > 0 ? 100 : 0)
    : 50 + (clampedEval / 10) * 50;

  const displayEval = possibleMate
    ? `#${possibleMate}`
    : positionEvaluation >= 0
      ? `+${positionEvaluation.toFixed(2)}`
      : positionEvaluation.toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">Stockfish Analysis Board</h1>
        <p className="text-slate-400 text-center mb-6">Make moves and see Stockfish's evaluation</p>

        <div className="flex gap-6 justify-center">
          {/* Evaluation Bar */}
          <div className="flex flex-col items-center">
            <div className="text-xs text-slate-400 mb-1">Black</div>
            <div className="relative w-8 h-[400px] bg-zinc-900 rounded overflow-hidden border border-zinc-700">
              {/* White section (bottom) */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-500 ease-out"
                style={{ height: `${whitePercentage}%` }}
              />
              {/* Black section (top) */}
              <div
                className="absolute top-0 left-0 right-0 bg-zinc-700 transition-all duration-500 ease-out"
                style={{ height: `${100 - whitePercentage}%` }}
              />
              {/* Center line */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-yellow-500/50" />
              {/* Eval number on bar */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xs font-bold px-1 rounded ${positionEvaluation >= 0 ? 'bg-black/70 text-white' : 'bg-white/90 text-black'}`}>
                  {displayEval}
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-1">White</div>
          </div>

          {/* Chessboard */}
          <div className="w-[600px]">
            <Chessboard
              id="stockfish-board"
              position={chessPosition}
              onPieceDrop={onPieceDrop}
              customBoardStyle={{
                borderRadius: '8px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}
            />
          </div>

          {/* Info Panel */}
          <div className="w-64 bg-slate-800 rounded-lg p-4 space-y-4">
            <div>
              <div className="text-slate-400 text-sm">Status</div>
              <div className={`font-medium ${isAnalyzing ? 'text-yellow-400' : 'text-green-400'}`}>
                {isAnalyzing ? '🔄 Analyzing...' : '✓ Ready'}
              </div>
            </div>

            <div>
              <div className="text-slate-400 text-sm">Depth</div>
              <div className="font-medium text-xl">{depth}</div>
            </div>

            <div>
              <div className="text-slate-400 text-sm">Evaluation</div>
              <div className={`font-bold text-2xl ${positionEvaluation >= 0 ? 'text-white' : 'text-red-400'}`}>
                {displayEval}
              </div>
            </div>

            <div>
              <div className="text-slate-400 text-sm">Best Move</div>
              <div className="font-mono text-green-400 text-lg">{bestMoveSan}</div>
            </div>

            <div>
              <div className="text-slate-400 text-sm mb-2">Top 3 Lines</div>
              <div className="space-y-1">
                {topLines.length > 0 ? topLines.map((line, idx) => {
                  const evalDisplay = line.mate !== undefined 
                    ? `#${line.mate}` 
                    : line.scoreCp !== undefined 
                      ? `${(line.scoreCp / 100 * (chessGame.turn() === 'w' ? 1 : -1)) >= 0 ? '+' : ''}${(line.scoreCp / 100 * (chessGame.turn() === 'w' ? 1 : -1)).toFixed(1)}`
                      : '?';
                  const sanLine = uciLineToSan(chessPosition, line.pv);
                  const bgColors = ['bg-green-900/50 hover:bg-green-800/60', 'bg-yellow-900/40 hover:bg-yellow-800/50', 'bg-orange-900/30 hover:bg-orange-800/40'];
                  return (
                    <div 
                      key={idx} 
                      onClick={() => playLineMove(line.pv)}
                      className={`cursor-pointer rounded px-2 py-1.5 transition ${bgColors[idx] || 'bg-slate-700 hover:bg-slate-600'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs font-bold w-4">{line.multipv}</span>
                        <span className="text-white font-semibold text-sm min-w-[45px]">{evalDisplay}</span>
                        <span className="font-mono text-xs text-slate-200 truncate">
                          {sanLine.split(' ').slice(0, 6).join(' ')}
                        </span>
                      </div>
                    </div>
                  );
                }) : <span className="text-slate-500 text-sm">-</span>}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-700">
              <div className="text-slate-400 text-sm">Turn</div>
              <div className="font-medium">{chessGame.turn() === 'w' ? '⚪ White' : '⚫ Black'}</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-4 justify-center mt-6">
          <button
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition"
            onClick={() => {
              const fen = randomFens[Math.floor(Math.random() * randomFens.length)];
              chessGame.load(fen);
              setChessPosition(chessGame.fen());
              engine.stop();
              setBestLine('');
              setPositionEvaluation(0);
              setPossibleMate('');
              setDepth(0);
              setTopLines([]);
            }}
          >
            🎲 Random Position
          </button>
          <button
            className="px-5 py-2 bg-slate-600 hover:bg-slate-700 rounded font-medium transition"
            onClick={() => {
              chessGame.reset();
              setChessPosition(chessGame.fen());
              engine.stop();
              setBestLine('');
              setPositionEvaluation(0);
              setPossibleMate('');
              setDepth(0);
              setTopLines([]);
            }}
          >
            🔄 Reset Board
          </button>
          <button
            className="px-5 py-2 bg-red-600 hover:bg-red-700 rounded font-medium transition"
            onClick={() => engine.stop()}
          >
            ⏹ Stop Analysis
          </button>
        </div>

        {/* FEN display */}
        <div className="mt-6 bg-slate-800/50 rounded p-3 text-center">
          <span className="text-slate-400 text-sm">FEN: </span>
          <span className="font-mono text-xs text-slate-300">{chessPosition}</span>
        </div>
      </div>
    </div>
  );
}
