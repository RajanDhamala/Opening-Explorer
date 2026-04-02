import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import Engine, { hasSharedArrayBuffer } from "../engine";
import type { EngineOptions } from "../engine";

const MIN_EVAL_UPDATE_DEPTH = 12;

const getGameStatus = (game: Chess) => {
  if (game.isCheckmate()) {
    const winner = game.turn() === "w" ? "Black" : "White";
    return `Checkmate. ${winner} wins.`;
  }

  if (game.isStalemate()) {
    return "Stalemate.";
  }

  if (game.isDraw()) {
    return "Draw.";
  }

  const currentTurn = game.turn() === "w" ? "White" : "Black";
  if (game.isCheck()) {
    return `${currentTurn} to move (check).`;
  }

  return `${currentTurn} to move.`;
};

const BoardPage = () => {
  const game = useMemo(() => new Chess(), []);
  const [position, setPosition] = useState(game.fen());
  const [fenInput, setFenInput] = useState(game.fen());
  const [fenError, setFenError] = useState("");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [status, setStatus] = useState(getGameStatus(game));

  // Stockfish analysis state
  const engineRef = useRef<Engine | null>(null);
  const initRef = useRef(false);
  const [positionEvaluation, setPositionEvaluation] = useState(0);
  const [depth, setDepth] = useState(0);
  const [bestLine, setBestLine] = useState("");
  const [possibleMate, setPossibleMate] = useState("");
  const [isEvalReady, setIsEvalReady] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [engineLoading, setEngineLoading] = useState(true);
  const [topLines, setTopLines] = useState<Array<{ multipv: number; pv: string; scoreCp?: number; mate?: number }>>([]);
  const multiPV = 3;

  const hasSAB = hasSharedArrayBuffer();

  // UCI to SAN conversion helpers
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

  const uciLineToSan = (fen: string, uciLine: string): string => {
    const moves = uciLine.split(" ");
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
    return sanMoves.join(" ");
  };

  // Load engine on mount
  const loadEngine = useCallback((options: Partial<EngineOptions>) => {
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current.terminate();
    }
    setEngineLoading(true);
    setDepth(0);
    setBestLine("");
    setPossibleMate("");
    setPositionEvaluation(0);
    setIsEvalReady(false);
    setTopLines([]);
    setIsAnalyzing(false);

    const eng = new Engine(options);
    engineRef.current = eng;
    eng.onReady(() => {
      setEngineLoading(false);
    });
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const maxThreads = Math.max(1, navigator.hardwareConcurrency || 1);
    loadEngine({ threads: maxThreads, hash: 128, multiPV });
    return () => {
      engineRef.current?.terminate();
    };
  }, [loadEngine]);

  // Run analysis when position changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || engineLoading) return;
    const positionGame = new Chess(position);
    if (positionGame.isGameOver() || positionGame.isDraw()) {
      setIsAnalyzing(false);
      return;
    }

    const analyzedTurn = position.split(" ")[1] === "b" ? "b" : "w";
    const turnMultiplier = analyzedTurn === "w" ? 1 : -1;

    setIsAnalyzing(true);
    setDepth(0);
    setBestLine("");
    setPossibleMate("");
    setPositionEvaluation(0);
    setIsEvalReady(false);
    setTopLines([]);

    engine.onMessage(({ lines, bestMove }) => {
      if (bestMove) {
        setIsAnalyzing(false);
      }
      if (!lines || lines.length === 0) return;

      const topLine = lines[0];
      setBestLine(topLine.pv);

      const topLineDepth = topLine.depth ?? 0;
      if (topLineDepth > 0) setDepth(topLineDepth);

      if (topLineDepth >= MIN_EVAL_UPDATE_DEPTH) {
        setIsEvalReady(true);
        const whitePerspectiveMate =
          topLine.mate !== undefined ? topLine.mate * turnMultiplier : undefined;
        const whitePerspectiveCp =
          topLine.scoreCp !== undefined ? topLine.scoreCp * turnMultiplier : undefined;

        if (whitePerspectiveMate !== undefined) {
          setPositionEvaluation(whitePerspectiveMate > 0 ? 100 : -100);
          setPossibleMate(String(whitePerspectiveMate));
        } else if (whitePerspectiveCp !== undefined) {
          setPositionEvaluation(whitePerspectiveCp / 100);
          setPossibleMate("");
        }
      }

      setTopLines(
        lines.slice(0, multiPV).map(l => ({
          multipv: l.multipv,
          pv: l.pv,
          scoreCp: l.scoreCp !== undefined ? l.scoreCp * turnMultiplier : undefined,
          mate: l.mate !== undefined ? l.mate * turnMultiplier : undefined
        }))
      );
    });

    engine.evaluatePosition(position, 5000, 30);
  }, [position, engineLoading]);

  // Play a line's first move
  const playLineMove = (uciLine: string) => {
    const firstMove = uciLine.split(" ")[0];
    if (!firstMove || firstMove.length < 4) return;
    const from = firstMove.substring(0, 2) as Square;
    const to = firstMove.substring(2, 4) as Square;
    const promotion = firstMove.length > 4 ? firstMove[4] : undefined;
    try {
      const move = game.move({ from, to, promotion });
      if (move) {
        engineRef.current?.stop();
        setBestLine("");
        setPossibleMate("");
        setPositionEvaluation(0);
        setDepth(0);
        setIsEvalReady(false);
        setTopLines([]);
        setPosition(game.fen());
        setFenInput(game.fen());
        setMoveHistory(game.history());
        setStatus(getGameStatus(game));
      }
    } catch { /* ignore invalid */ }
  };

  // Computed values for eval bar
  const bestMove = bestLine?.split(" ")[0];
  const bestMoveSan = bestMove ? uciToSan(position, bestMove) : "-";
  const statusLabel = engineLoading ? "Loading..." : isAnalyzing ? "Analyzing..." : "Ready";
  const displayedLines = topLines.slice(0, multiPV);

  const clampedEval = Math.max(-10, Math.min(10, positionEvaluation));
  const whitePercentage = !isEvalReady
    ? 50
    : possibleMate
      ? (Number(possibleMate) > 0 ? 100 : 0)
      : 50 + (clampedEval / 10) * 50;

  const displayEval = !isEvalReady
    ? "..."
    : possibleMate
      ? `#${possibleMate}`
      : positionEvaluation >= 0
        ? `+${positionEvaluation.toFixed(2)}`
        : positionEvaluation.toFixed(2);

  const onDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!targetSquare) {
      return false;
    }

    const move = game.move({
      from: sourceSquare as Square,
      to: targetSquare as Square,
      promotion: "q",
    });

    if (move === null) {
      return false;
    }

    setPosition(game.fen());
    setFenInput(game.fen());
    setFenError("");
    setMoveHistory(game.history());
    setStatus(getGameStatus(game));
    // Reset analysis for new position
    engineRef.current?.stop();
    setBestLine("");
    setPossibleMate("");
    setPositionEvaluation(0);
    setDepth(0);
    setIsEvalReady(false);
    setTopLines([]);
    return true;
  };

  const handleLoadPosition = () => {
    try {
      game.load(fenInput.trim());
      setPosition(game.fen());
      setFenInput(game.fen());
      setFenError("");
      setMoveHistory(game.history());
      setStatus(getGameStatus(game));
      // Reset analysis
      engineRef.current?.stop();
      setBestLine("");
      setPossibleMate("");
      setPositionEvaluation(0);
      setDepth(0);
      setIsEvalReady(false);
      setTopLines([]);
    } catch {
      setFenError("Invalid FEN. Please enter a valid position.");
    }
  };

  const handleReset = () => {
    game.reset();
    setPosition(game.fen());
    setFenInput(game.fen());
    setFenError("");
    setMoveHistory([]);
    setStatus(getGameStatus(game));
    // Reset analysis
    engineRef.current?.stop();
    setBestLine("");
    setPossibleMate("");
    setPositionEvaluation(0);
    setDepth(0);
    setIsEvalReady(false);
    setTopLines([]);
  };

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Chess Board</h1>
              <p className="mt-1 text-sm text-neutral-400">{status}</p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900"
            >
              Reset Game
            </button>
          </div>

          <div className="mt-5 space-y-2">
            <label htmlFor="fen-input" className="block text-xs uppercase tracking-wide text-neutral-400">
              Load Position (FEN)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="fen-input"
                value={fenInput}
                onChange={(e) => setFenInput(e.target.value)}
                placeholder="Paste FEN here..."
                className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none ring-0 placeholder:text-neutral-500 focus:border-neutral-500"
              />
              <button
                type="button"
                onClick={handleLoadPosition}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900"
              >
                Load Position
              </button>
            </div>
            {fenError ? <p className="text-sm text-rose-400">{fenError}</p> : null}
            <p className="text-xs text-neutral-400">
              Current FEN: <span className="text-neutral-200 break-all">{position}</span>
            </p>
          </div>
        </div>

        {/* Engine status bar */}
        <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Stockfish 17.1 NNUE</span>
            <span className="text-xs text-neutral-400">{hasSAB ? "Multi-Thread" : "Single-Thread"}</span>
          </div>
          <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs font-medium">
            {statusLabel}
          </span>
        </div>

        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
          {/* Eval bar */}
          <div className="flex flex-row items-center gap-2 lg:flex-col">
            <div className="text-xs text-neutral-400">Black</div>
            <div className="relative h-8 w-[min(70vw,500px)] overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 lg:h-[min(70vw,500px)] lg:w-8">
              <div
                className="absolute left-0 top-0 bg-neutral-100 transition-all duration-500 ease-out lg:bottom-0 lg:left-0 lg:right-0 lg:top-auto"
                style={{
                  width: `${whitePercentage}%`,
                  height: "100%",
                }}
              />
              <div
                className="absolute right-0 top-0 bg-neutral-600 transition-all duration-500 ease-out lg:left-0 lg:right-0 lg:top-0"
                style={{
                  width: `${100 - whitePercentage}%`,
                  height: "100%",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded bg-neutral-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-100">
                  {displayEval}
                </span>
              </div>
            </div>
            <div className="text-xs text-neutral-400">White</div>
          </div>

          {/* Chessboard */}
          <div className="w-full max-w-[560px]">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3 sm:p-4">
              <Chessboard
                options={{
                  position,
                  onPieceDrop: onDrop,
                  darkSquareStyle: { backgroundColor: "#3f4f66" },
                  lightSquareStyle: { backgroundColor: "#d7deeb" },
                  boardStyle: { width: "100%", maxWidth: "560px" },
                }}
              />
            </div>
          </div>

          {/* Analysis panel */}
          <div className="w-full max-w-[320px] space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5 sm:p-6">
            <div>
              <div className="text-xs text-neutral-400">Depth</div>
              <div className="text-2xl font-semibold">{depth}</div>
            </div>

            <div>
              <div className="text-xs text-neutral-400">Evaluation</div>
              <div className={`text-2xl font-semibold ${positionEvaluation < 0 ? "text-red-400" : "text-neutral-100"}`}>
                {displayEval}
              </div>
            </div>

            <div>
              <div className="text-xs text-neutral-400">Best Move</div>
              <div className="font-mono text-lg text-neutral-100">{bestMoveSan}</div>
            </div>

            <div>
              <div className="mb-2 text-xs text-neutral-400">Top {multiPV} Lines</div>
              <div className="space-y-1.5">
                {displayedLines.length > 0 ? displayedLines.map((line, idx) => {
                  const evalDisplay = line.mate !== undefined
                    ? `#${line.mate}`
                    : line.scoreCp !== undefined
                      ? `${line.scoreCp / 100 >= 0 ? "+" : ""}${(line.scoreCp / 100).toFixed(1)}`
                      : "?";
                  const sanLine = uciLineToSan(position, line.pv);
                  return (
                    <div
                      key={`${line.multipv}-${idx}`}
                      onClick={() => playLineMove(line.pv)}
                      className="cursor-pointer rounded-md border border-neutral-700/50 bg-neutral-950/50 px-2 py-2 transition hover:bg-neutral-800"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-4 text-xs font-semibold text-neutral-500">{line.multipv}</span>
                        <span className="min-w-[45px] text-sm font-semibold text-neutral-100">{evalDisplay}</span>
                        <span className="truncate font-mono text-xs text-neutral-400">
                          {sanLine.split(" ").slice(0, 6).join(" ")}
                        </span>
                      </div>
                    </div>
                  );
                }) : <span className="text-xs text-neutral-400">No lines yet.</span>}
              </div>
            </div>

            <div className="border-t border-neutral-700 pt-3">
              <div className="text-xs text-neutral-400">Turn</div>
              <div className="text-sm font-medium">{game.turn() === "w" ? "White" : "Black"}</div>
            </div>
          </div>
        </div>

        {/* Moves section */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Moves</h2>
          {moveHistory.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">No moves yet.</p>
          ) : (
            <ol className="mt-3 grid grid-cols-4 gap-x-4 gap-y-2 text-sm text-neutral-200 sm:grid-cols-6 md:grid-cols-8">
              {moveHistory.map((move, index) => (
                <li key={`${move}-${index}`} className="rounded-md bg-neutral-950 px-2 py-1">
                  {index + 1}. {move}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};

export default BoardPage;
