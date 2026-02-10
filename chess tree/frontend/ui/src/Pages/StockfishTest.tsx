import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'react-chessboard/dist/chessboard/types';
import Engine, { ENGINE_VARIANTS, getDefaultVariant, hasSharedArrayBuffer } from '../engine';
import type { EngineOptions, EngineVariant } from '../engine';

export default function StockfishTest() {
  const [selectedVariant, setSelectedVariant] = useState<EngineVariant>(getDefaultVariant());
  const engineRef = useRef<Engine | null>(null);
  const initRef = useRef(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const maxThreads = useMemo(
    () => Math.max(1, typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1),
    []
  );
  const initialOptions = useMemo(
    () => ({ threads: maxThreads, hash: 128, multiPV: 3 }),
    [maxThreads]
  );
  const [threadCount, setThreadCount] = useState(initialOptions.threads);
  const [hashSize, setHashSize] = useState(initialOptions.hash);
  const [multiPV, setMultiPV] = useState(initialOptions.multiPV);

  const chessGameRef = useRef(new Chess());
  const chessGame = chessGameRef.current;

  const [chessPosition, setChessPosition] = useState(chessGame.fen());
  const [positionEvaluation, setPositionEvaluation] = useState(0);
  const [depth, setDepth] = useState(0);
  const [bestLine, setBestLine] = useState('');
  const [possibleMate, setPossibleMate] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const [topLines, setTopLines] = useState<Array<{ multipv: number; pv: string; scoreCp?: number; mate?: number }>>([]);

  const hasSAB = hasSharedArrayBuffer();

  const randomFens = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r1bqkbnr/pppp1ppp/2n5/4p3/8/5NP1/PPPPPPBP/RNBQK2R w KQkq - 2 4",
    "rnbq1rk1/pppp1ppp/4pn2/8/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 2 6",
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 6"
  ];

  // Load engine for selected variant
  const loadEngine = useCallback((variant: EngineVariant, options: EngineOptions) => {
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current.terminate();
    }
    setEngineLoading(true);
    setDepth(0);
    setBestLine('');
    setPossibleMate('');
    setPositionEvaluation(0);
    setTopLines([]);
    setIsAnalyzing(false);

    setSelectedVariant(variant);
    const eng = new Engine(variant, options);
    engineRef.current = eng;
    eng.onReady(() => {
      setEngineLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedVariant.multiThreaded) {
      setThreadCount(1);
      return;
    }
    setThreadCount((prev) => Math.min(Math.max(1, prev), maxThreads));
  }, [maxThreads, selectedVariant.multiThreaded]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || engineLoading) return;
    engine.updateOptions({ threads: threadCount, hash: hashSize, multiPV });
    setTopLines([]);
  }, [engineLoading, hashSize, multiPV, threadCount]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [settingsOpen]);

  useEffect(() => {
    const fen = randomFens[Math.floor(Math.random() * randomFens.length)];
    chessGame.load(fen);
    setChessPosition(chessGame.fen());
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    loadEngine(getDefaultVariant(), initialOptions);
  }, [initialOptions, loadEngine]);

  // Run analysis whenever position changes and engine is loaded
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || engineLoading) return;
    if (chessGame.isGameOver() || chessGame.isDraw()) return;

    setIsAnalyzing(true);
    engine.evaluatePosition(chessGame.fen(), 5000, 30);

    engine.onMessage(({ lines }) => {
      if (!lines || lines.length === 0) return;

      const topLine = lines[0];
      setBestLine(topLine.pv);

      if (topLine.mate !== undefined) {
        setPositionEvaluation(topLine.mate > 0 ? 100 : -100);
        setPossibleMate(String(topLine.mate));
      } else if (topLine.scoreCp !== undefined) {
        const evalScore = (chessGame.turn() === 'w' ? 1 : -1) * topLine.scoreCp / 100;
        setPositionEvaluation(evalScore);
        setPossibleMate('');
      }

      if (topLine.depth) setDepth(topLine.depth);

      setTopLines(
        lines.slice(0, multiPV).map(l => ({
          multipv: l.multipv,
          pv: l.pv,
          scoreCp: l.scoreCp,
          mate: l.mate
        }))
      );

      setIsAnalyzing(false);
    });
  }, [chessPosition, engineLoading, multiPV]);

  function onPieceDrop(sourceSquare: Square, targetSquare: Square) {
    try {
      const move = chessGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });
      if (move) {
        engineRef.current?.stop();
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

  const playLineMove = (uciLine: string) => {
    const firstMove = uciLine.split(' ')[0];
    if (!firstMove || firstMove.length < 4) return;
    const from = firstMove.substring(0, 2) as Square;
    const to = firstMove.substring(2, 4) as Square;
    const promotion = firstMove.length > 4 ? firstMove[4] : undefined;
    try {
      const move = chessGame.move({ from, to, promotion });
      if (move) {
        engineRef.current?.stop();
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
  const statusLabel = engineLoading ? 'Loading' : isAnalyzing ? 'Analyzing' : 'Ready';
  const displayedLines = topLines.slice(0, multiPV);

  const clampedEval = Math.max(-10, Math.min(10, positionEvaluation));
  const whitePercentage = possibleMate
    ? (Number(possibleMate) > 0 ? 100 : 0)
    : 50 + (clampedEval / 10) * 50;

  const displayEval = possibleMate
    ? `#${possibleMate}`
    : positionEvaluation >= 0
      ? `+${positionEvaluation.toFixed(2)}`
      : positionEvaluation.toFixed(2);

  const strengthStars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Stockfish Analysis</h1>
            <p className="text-sm text-muted-foreground">Play moves and review engine evaluation.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Stockfish 17.1</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
            <span>{hashSize}MB · {multiPV} lines</span>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-base">{selectedVariant.icon}</span>
              <span>{selectedVariant.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{selectedVariant.size}</span>
            <span className="text-xs text-muted-foreground">{strengthStars(selectedVariant.strength)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium">
              {statusLabel}
            </span>
            <div ref={settingsRef} className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((prev) => !prev)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                aria-expanded={settingsOpen}
              >
                Settings
              </button>
              {settingsOpen && (
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Engine</div>
                      {!hasSAB && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          SharedArrayBuffer unavailable. Multi-threaded engines are disabled.
                        </p>
                      )}
                      <div className="mt-3 space-y-2">
                        {ENGINE_VARIANTS.map((v) => {
                          const disabled = v.requiresCORS && !hasSAB;
                          const isSelected = selectedVariant.id === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              disabled={disabled || engineLoading}
                              onClick={() => {
                                if (disabled || engineLoading) return;
                                loadEngine(v, { threads: threadCount, hash: hashSize, multiPV });
                                setSettingsOpen(false);
                              }}
                              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                                disabled
                                  ? 'cursor-not-allowed border-border/50 bg-muted/40 text-muted-foreground'
                                  : isSelected
                                    ? 'border-foreground/40 bg-muted'
                                    : 'border-border bg-background hover:bg-muted'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-base">{v.icon}</span>
                                <div className="flex-1">
                                  <div className="font-medium">{v.name}</div>
                                  <div className="text-xs text-muted-foreground">{v.description}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">Threads</div>
                          <div className="text-xs text-muted-foreground">
                            {selectedVariant.multiThreaded ? `Up to ${maxThreads}` : 'Single-threaded engine'}
                          </div>
                        </div>
                        <span className="text-xs font-mono">{threadCount}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={maxThreads}
                        step={1}
                        value={threadCount}
                        disabled={!selectedVariant.multiThreaded}
                        onChange={(event) => setThreadCount(Number(event.target.value))}
                        className="h-2 w-full cursor-pointer rounded-full bg-muted accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">Memory</div>
                          <div className="text-xs text-muted-foreground">Hash size in MB</div>
                        </div>
                        <span className="text-xs font-mono">{hashSize} MB</span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={512}
                        step={16}
                        value={hashSize}
                        onChange={(event) => setHashSize(Number(event.target.value))}
                        className="h-2 w-full cursor-pointer rounded-full bg-muted accent-foreground"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">Lines</div>
                          <div className="text-xs text-muted-foreground">MultiPV variations</div>
                        </div>
                        <span className="text-xs font-mono">{multiPV}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={multiPV}
                        onChange={(event) => setMultiPV(Number(event.target.value))}
                        className="h-2 w-full cursor-pointer rounded-full bg-muted accent-foreground"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
          <div className="flex flex-row items-center gap-3 lg:flex-col">
            <div className="text-xs text-muted-foreground">Black</div>
            <div className="relative h-[min(85vw,720px)] w-8 overflow-hidden rounded-md border border-border bg-muted">
              <div
                className="absolute bottom-0 left-0 right-0 bg-foreground transition-all duration-500 ease-out"
                style={{ height: `${whitePercentage}%` }}
              />
              <div
                className="absolute top-0 left-0 right-0 bg-muted-foreground/40 transition-all duration-500 ease-out"
                style={{ height: `${100 - whitePercentage}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded bg-background/80 px-1 text-[10px] font-semibold text-foreground">
                  {displayEval}
                </span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">White</div>
          </div>

          <div className="w-full max-w-[720px]">
            <div className="aspect-square w-full">
              <Chessboard
                id="stockfish-board"
                position={chessPosition}
                onPieceDrop={onPieceDrop}
                customBoardStyle={{
                  borderRadius: '10px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.35)'
                }}
              />
            </div>
          </div>

          <div className="w-full max-w-[320px] space-y-4 rounded-lg border border-border bg-card p-4">
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="text-sm font-medium">{statusLabel}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Depth</div>
              <div className="text-2xl font-semibold">{depth}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Evaluation</div>
              <div className={`text-2xl font-semibold ${positionEvaluation < 0 ? 'text-red-400' : 'text-foreground'}`}>
                {displayEval}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Best Move</div>
              <div className="font-mono text-lg text-foreground">{bestMoveSan}</div>
            </div>

            <div>
              <div className="mb-2 text-xs text-muted-foreground">Top {multiPV} Lines</div>
              <div className="space-y-1.5">
                {displayedLines.length > 0 ? displayedLines.map((line, idx) => {
                  const evalDisplay = line.mate !== undefined
                    ? `#${line.mate}`
                    : line.scoreCp !== undefined
                      ? `${(line.scoreCp / 100 * (chessGame.turn() === 'w' ? 1 : -1)) >= 0 ? '+' : ''}${(line.scoreCp / 100 * (chessGame.turn() === 'w' ? 1 : -1)).toFixed(1)}`
                      : '?';
                  const sanLine = uciLineToSan(chessPosition, line.pv);
                  return (
                    <div
                      key={`${line.multipv}-${idx}`}
                      onClick={() => playLineMove(line.pv)}
                      className="cursor-pointer rounded-md border border-border/50 bg-muted/50 px-2 py-2 transition hover:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground w-4">{line.multipv}</span>
                        <span className="text-sm font-semibold text-foreground min-w-[45px]">{evalDisplay}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {sanLine.split(' ').slice(0, 6).join(' ')}
                        </span>
                      </div>
                    </div>
                  );
                }) : <span className="text-xs text-muted-foreground">No lines yet.</span>}
              </div>
            </div>

            <div className="border-t border-border pt-2">
              <div className="text-xs text-muted-foreground">Turn</div>
              <div className="text-sm font-medium">{chessGame.turn() === 'w' ? 'White' : 'Black'}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            className="rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium transition hover:bg-muted/70"
            onClick={() => {
              const fen = randomFens[Math.floor(Math.random() * randomFens.length)];
              chessGame.load(fen);
              setChessPosition(chessGame.fen());
              engineRef.current?.stop();
              setBestLine('');
              setPositionEvaluation(0);
              setPossibleMate('');
              setDepth(0);
              setTopLines([]);
            }}
          >
            Random Position
          </button>
          <button
            className="rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium transition hover:bg-muted/70"
            onClick={() => {
              chessGame.reset();
              setChessPosition(chessGame.fen());
              engineRef.current?.stop();
              setBestLine('');
              setPositionEvaluation(0);
              setPossibleMate('');
              setDepth(0);
              setTopLines([]);
            }}
          >
            Reset Board
          </button>
          <button
            className="rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium transition hover:bg-muted/70"
            onClick={() => engineRef.current?.stop()}
          >
            Stop Analysis
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <span>FEN: </span>
          <span className="font-mono text-[11px] text-foreground">{chessPosition}</span>
        </div>
      </div>
    </div>
  );
}
