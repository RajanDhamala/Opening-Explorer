import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { EvalBar } from "../components/EvalBar";
import { EngineLines } from "../components/EngineLines";
import { MoveNavigator } from "../components/MoveNavigator";
import { PuzzleProgress } from "../components/PuzzleProgress";
import { uciToSan, pvToSan, type EngineLine, type PuzzleAttempt, type BoardArrow, colors } from "../components/puzzleUtils";


interface Puzzle {
  _id: string;
  game_id: string;
  moveindex: number;
  movesan: string;
  moveuci: string;
  fen: string;
  sidetomove: string;
  playercolor: string;
  usercolor: string;
  issuetype: string;
  playedbestmove: boolean;
  bestmove: string;
  ponder: string;
  pv: string[];
  depth: number;
  scorecp: number;
  mate: number;
  afterscorecp: number;
  aftermate: number;
  winprobbefore: number;
  winprobafter: number;
}

interface PuzzlesResponse {
  puzzles?: Puzzle[];
  total?: number;
}

const ISSUE_TYPES = [
  { value: "all", label: "All" },
  { value: "blunder", label: "Blunders" },
  { value: "mistake", label: "Mistakes" },
  { value: "inaccuracy", label: "Inaccuracies" },
];
const MIN_EVAL_UPDATE_DEPTH = 12;

const fetchPuzzles = async (type: string): Promise<Puzzle[]> => {
  const url = type === "all"
    ? "http://localhost:3030/games/puzzles"
    : `http://localhost:3030/games/puzzles/${type}`;
  const response = await axios.get<PuzzlesResponse>(url, { withCredentials: true });
  return Array.isArray(response.data?.puzzles) ? response.data.puzzles : [];
};


const PuzzlesPage = () => {
  // ─── State ─────────────────────────────────────────────────
  const [selectedType, setSelectedType] = useState("all");
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [attempts, setAttempts] = useState<PuzzleAttempt[]>([]);
  const [autoAdvance, setAutoAdvance] = useState(() => localStorage.getItem("puzzle_autoAdvance") === "true");

  const [positionHistory, setPositionHistory] = useState<string[]>([]);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);

  const [status, setStatus] = useState<"playing" | "correct" | "wrong" | "solution">("playing");
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [showEngine, setShowEngine] = useState(() => localStorage.getItem("puzzle_showEngine") === "true");

  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  const [engineDepth, setEngineDepth] = useState(0);
  const [stableEngineEval, setStableEngineEval] = useState<{ score: number | null; mate: number | null } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlayingLine, setIsPlayingLine] = useState(false);

  const stockfishRef = useRef<Worker | null>(null);
  const stockfishReadyRef = useRef(false);
  const currentFenRef = useRef<string>("");
  const activeAnalysisFenRef = useRef<string>("");
  const playLineTimeoutRef = useRef<number | null>(null);

  const { data: puzzles = [], isLoading, isError } = useQuery({
    queryKey: ["puzzles", selectedType],
    queryFn: () => fetchPuzzles(selectedType),
  });

  const puzzle = puzzles[puzzleIndex] || null;
  const currentFen = positionHistory[currentMoveIndex + 1] || puzzle?.fen || "";
  const isFlipped = puzzle?.playercolor === "black";

  // Keep currentFenRef in sync for stockfish closure
  useEffect(() => {
    currentFenRef.current = currentFen;
  }, [currentFen]);

  // Cleanup playLine timeouts on unmount
  useEffect(() => {
    return () => {
      if (playLineTimeoutRef.current) {
        clearTimeout(playLineTimeoutRef.current);
      }
    };
  }, []);

  // Track pending analysis request
  const pendingFenRef = useRef<string | null>(null);
  const waitingForReadyRef = useRef(false);

  useEffect(() => {
    console.log("🔧 Initializing Stockfish 17.1 Lite worker...");
    
    // Use Stockfish 17.1 NNUE Lite single-thread (simplest, single wasm file, works everywhere)
    const worker = new Worker("/stockfish/stockfish-17.1-lite-single-03e3232.js");

    worker.onmessage = (e: MessageEvent) => {
      const line = e.data;
      // Only log non-spammy messages
      if (typeof line === "string" && !line.startsWith("info depth")) {
        console.log("📨 Stockfish:", line);
      }

      if (typeof line === "string" && line.includes("uciok")) {
        console.log("✅ Stockfish UCI OK, configuring...");
        worker.postMessage("setoption name Hash value 32");
        worker.postMessage("setoption name MultiPV value 3");
        worker.postMessage("isready");
      }

      if (typeof line === "string" && line.includes("readyok")) {
        console.log("✅ Stockfish READY!");
        stockfishReadyRef.current = true;
        
        // If we have a pending analysis, start it now
        if (waitingForReadyRef.current && pendingFenRef.current) {
          const fenToAnalyze = pendingFenRef.current;
          activeAnalysisFenRef.current = fenToAnalyze;
          console.log("📤 Starting pending analysis for:", fenToAnalyze);
          worker.postMessage(`position fen ${fenToAnalyze}`);
          worker.postMessage("go depth 22");
          pendingFenRef.current = null;
          waitingForReadyRef.current = false;
        }
      }

      // Parse multipv info lines
      if (typeof line === "string" && line.includes("multipv") && line.includes("score")) {
        if (waitingForReadyRef.current) {
          return;
        }
        const depthMatch = line.match(/depth (\d+)/);
        const pvIdxMatch = line.match(/multipv (\d+)/);
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        const pvMatch = line.match(/ pv (.+)/);

        if (depthMatch && pvIdxMatch) {
          const depth = parseInt(depthMatch[1], 10);
          const pvIdx = parseInt(pvIdxMatch[1], 10) - 1;

          let score: number | null = null;
          let mate: number | null = null;
          if (scoreMatch) {
            if (scoreMatch[1] === "cp") {
              score = parseInt(scoreMatch[2], 10);
            } else {
              mate = parseInt(scoreMatch[2], 10);
            }
          }

          const analysisFen = activeAnalysisFenRef.current || currentFenRef.current;
          const analyzedTurn = analysisFen.split(" ")[1] === "b" ? "b" : "w";
          const turnMultiplier = analyzedTurn === "w" ? 1 : -1;

          if (score !== null) {
            score = score * turnMultiplier;
          }
          if (mate !== null) {
            mate = mate * turnMultiplier;
          }

          const pvMoves = pvMatch ? pvMatch[1].split(" ").filter(m => m.length >= 4) : [];
          const pvSan = currentFenRef.current ? pvToSan(currentFenRef.current, pvMoves) : pvMoves;

          setEngineDepth(depth);
          setEngineLines(prev => {
            const updated = [...prev];
            updated[pvIdx] = { pvIdx, depth, score, mate, pv: pvMoves, pvSan };
            return updated.slice(0, 3);
          });

          if (pvIdx === 0 && depth >= MIN_EVAL_UPDATE_DEPTH) {
            setStableEngineEval({ score, mate });
          }
        }
      }

      if (typeof line === "string" && line.includes("bestmove")) {
        if (!waitingForReadyRef.current) {
          console.log("✅ Stockfish analysis complete");
          setIsAnalyzing(false);
        }
      }
    };

    worker.onerror = (e) => {
      console.error("❌ Stockfish worker error:", e);
      setIsAnalyzing(false);
      waitingForReadyRef.current = false;
      pendingFenRef.current = null;
    };

    console.log("📤 Sending 'uci' command...");
    worker.postMessage("uci");
    stockfishRef.current = worker;

    return () => {
      console.log("🛑 Terminating Stockfish worker");
      worker.postMessage("quit");
      worker.terminate();
    };
  }, []);

  const analyzePosition = useCallback((fen: string, force = false) => {
    console.log("🔍 analyzePosition called:", { fen, force, showEngine, ready: stockfishReadyRef.current, worker: !!stockfishRef.current });
    
    if (!stockfishRef.current) {
      console.error("❌ No stockfish worker!");
      return;
    }
    
    // When force=true (user clicked analyze), skip ready check - send command anyway
    if (!force) {
      if (!stockfishReadyRef.current) {
        console.log("⏳ Stockfish not ready yet, skipping auto-analyze");
        return;
      }
      if (!showEngine) {
        console.log("⏭️ Engine not enabled, skipping");
        return;
      }
    }

    console.log("📤 Stopping current analysis and starting new...");
    
    // Stop current analysis
    stockfishRef.current.postMessage("stop");
    
    // Clear old lines
    setEngineLines([]);
    setEngineDepth(0);
    setStableEngineEval(null);
    setIsAnalyzing(true);

    // Send ucinewgame to reset engine state, then wait for readyok
    stockfishRef.current.postMessage("ucinewgame");
    activeAnalysisFenRef.current = fen;
    pendingFenRef.current = fen;
    waitingForReadyRef.current = true;
    stockfishRef.current.postMessage("isready");
  }, [showEngine]);

  useEffect(() => {
    if (puzzle) {
      // Cancel any ongoing line playback
      if (playLineTimeoutRef.current) {
        clearTimeout(playLineTimeoutRef.current);
        playLineTimeoutRef.current = null;
      }
      setIsPlayingLine(false);
      
      setPositionHistory([puzzle.fen]);
      setMoveHistory([]);
      setCurrentMoveIndex(-1);
      setStatus("playing");
      setArrows([]);
      setEngineLines([]);
      setEngineDepth(0);
      setStableEngineEval(null);

      if (showEngine) {
        analyzePosition(puzzle.fen);
      }
    }
  }, [puzzle?._id, showEngine, analyzePosition]);

  useEffect(() => {
    if (currentFen && showEngine) {
      analyzePosition(currentFen);
    }
  }, [currentFen, showEngine, analyzePosition]);

  useEffect(() => {
    localStorage.setItem("puzzle_autoAdvance", String(autoAdvance));
  }, [autoAdvance]);

  useEffect(() => {
    localStorage.setItem("puzzle_showEngine", String(showEngine));
  }, [showEngine]);

  const goToNextPuzzle = useCallback(() => {
    if (puzzleIndex < puzzles.length - 1) {
      setPuzzleIndex(i => i + 1);
    }
  }, [puzzleIndex, puzzles.length]);

  const goToPrevPuzzle = useCallback(() => {
    if (puzzleIndex > 0) {
      setPuzzleIndex(i => i - 1);
    }
  }, [puzzleIndex]);

  const navigateToMove = useCallback((index: number) => {
    if (index >= -1 && index < moveHistory.length) {
      setCurrentMoveIndex(index);
      setArrows([]);
    }
  }, [moveHistory.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          navigateToMove(Math.max(-1, currentMoveIndex - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          if (currentMoveIndex < moveHistory.length - 1) {
            navigateToMove(currentMoveIndex + 1);
          } else if (status !== "playing") {
            goToNextPuzzle();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          goToPrevPuzzle();
          break;
        case "ArrowDown":
          e.preventDefault();
          goToNextPuzzle();
          break;
        case "h":
          handleGetHint();
          break;
        case "s":
          handleViewSolution();
          break;
        case " ":
          if (status !== "playing") {
            e.preventDefault();
            goToNextPuzzle();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentMoveIndex, moveHistory.length, status, navigateToMove, goToNextPuzzle, goToPrevPuzzle]);

  const handleGetHint = useCallback(() => {
    if (!puzzle || status !== "playing") return;

    const from = puzzle.bestmove.slice(0, 2);
    const to = puzzle.bestmove.slice(2, 4);

    setArrows([{ from, to, color: colors.arrowGreen }]);
  }, [puzzle, status]);

  // Animated line playback with 400ms delay between moves
  const playLineWithDelay = useCallback((
    fens: string[],
    moves: string[],
    onComplete?: () => void
  ) => {
    if (fens.length === 0) return;

    // Clear any existing timeout
    if (playLineTimeoutRef.current) {
      clearTimeout(playLineTimeoutRef.current);
    }

    setIsPlayingLine(true);
    setPositionHistory(fens);
    setMoveHistory(moves);
    setCurrentMoveIndex(-1); // Start from initial position
    setArrows([]);

    let currentIdx = 0;
    const playNextMove = () => {
      if (currentIdx < moves.length) {
        setCurrentMoveIndex(currentIdx);
        currentIdx++;
        playLineTimeoutRef.current = window.setTimeout(playNextMove, 400);
      } else {
        setIsPlayingLine(false);
        onComplete?.();
      }
    };

    // Start playing after a short initial delay
    playLineTimeoutRef.current = window.setTimeout(playNextMove, 400);
  }, []);

  const handleViewSolution = useCallback(() => {
    if (!puzzle || isPlayingLine) return;

    try {
      const game = new Chess(puzzle.fen);
      const fens = [puzzle.fen];
      const moves: string[] = [];

      for (const uci of puzzle.pv) {
        if (!uci || uci.length < 4) break;
        const move = game.move({
          from: uci.slice(0, 2) as Square,
          to: uci.slice(2, 4) as Square,
          promotion: uci.length > 4 ? uci[4] : undefined,
        });
        if (move) {
          moves.push(move.san);
          fens.push(game.fen());
        } else break;
      }

      setStatus("solution");

      if (status === "playing") {
        setAttempts(prev => [...prev, { puzzleId: puzzle._id, result: "skipped" }]);
      }

      // Play the line with animated delay
      playLineWithDelay(fens, moves);
    } catch {
      // Ignore
    }
  }, [puzzle, status, isPlayingLine, playLineWithDelay]);

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }): boolean => {
    if (!puzzle || !targetSquare || isPlayingLine) return false;
    
    // In analysis/solution mode, allow moves from both sides
    const isAnalysisMode = status === "solution" || status === "correct" || status === "wrong";
    
    // Only restrict navigation in playing mode
    if (!isAnalysisMode && currentMoveIndex !== moveHistory.length - 1 && moveHistory.length > 0) return false;

    try {
      const game = new Chess(currentFen);
      const move = game.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: "q",
      });

      if (!move) return false;

      const newFen = game.fen();
      const userUci = sourceSquare + targetSquare;

      setPositionHistory(prev => [...prev.slice(0, currentMoveIndex + 2), newFen]);
      setMoveHistory(prev => [...prev.slice(0, currentMoveIndex + 1), move.san]);
      setCurrentMoveIndex(prev => prev + 1);
      setArrows([]);

      if (status === "playing") {
        const isCorrect = puzzle.bestmove.startsWith(userUci);

        if (isCorrect) {
          setStatus("correct");
          setAttempts(prev => [...prev, { puzzleId: puzzle._id, result: "correct" }]);

          if (autoAdvance) {
            setTimeout(goToNextPuzzle, 800);
          }
        } else {
          setStatus("wrong");
          setAttempts(prev => [...prev, { puzzleId: puzzle._id, result: "wrong" }]);

          setArrows([
            { from: sourceSquare, to: targetSquare, color: colors.arrowRed },
            { from: puzzle.bestmove.slice(0, 2), to: puzzle.bestmove.slice(2, 4), color: colors.arrowGreen },
          ]);
        }
      }

      return true;
    } catch {
      return false;
    }
  }, [puzzle, status, currentFen, currentMoveIndex, moveHistory.length, autoAdvance, goToNextPuzzle, isPlayingLine]);

  const handleRetry = useCallback(() => {
    if (!puzzle) return;
    setPositionHistory([puzzle.fen]);
    setMoveHistory([]);
    setCurrentMoveIndex(-1);
    setStatus("playing");
    setArrows([]);
  }, [puzzle]);

  const bestMoveSan = useMemo(() => {
    if (!puzzle) return "";
    return uciToSan(puzzle.fen, puzzle.bestmove);
  }, [puzzle]);

  const currentEval = useMemo(() => {
    if (stableEngineEval) {
      return stableEngineEval;
    }
    if (puzzle) {
      return { score: puzzle.scorecp, mate: puzzle.mate !== 0 ? puzzle.mate : null };
    }
    return { score: 0, mate: null };
  }, [stableEngineEval, puzzle]);

  const formattedArrows = useMemo(() => {
    return arrows.map(a => ({ startSquare: a.from, endSquare: a.to, color: a.color }));
  }, [arrows]);


  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#161512] flex items-center justify-center">
        <div className="text-[#bababa]">Loading puzzles...</div>
      </div>
    );
  }

  if (isError || puzzles.length === 0) {
    return (
      <div className="min-h-screen bg-[#161512] flex items-center justify-center">
        <div className="text-center">
          <div className="text-[#bababa] mb-2">No puzzles found</div>
          <div className="text-sm text-[#8b8987]">Process some games first to generate puzzles</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#161512] text-[#bababa]">
      <div className="border-b border-[#3a3836] bg-[#1a1816]">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-4 overflow-x-auto">
          {ISSUE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => { setSelectedType(type.value); setPuzzleIndex(0); }}
              className={`px-3 py-1 text-sm whitespace-nowrap transition ${selectedType === type.value
                  ? "text-white bg-[#629924] rounded"
                  : "text-[#8b8987] hover:text-[#bababa]"
                }`}
            >
              {type.label}
            </button>
          ))}
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-xs text-[#8b8987] cursor-pointer">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="w-3 h-3"
            />
            Auto-advance
          </label>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 py-4">
        <div className="flex gap-4 lg:gap-8 flex-col lg:flex-row justify-center">

          {/* Left: Game Info */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            <div className="bg-[#262421] rounded p-4 text-sm border border-[#3a3836]">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-2xl mt-1">🎯</div>
                <div>
                  <div className="text-[#bababa]">Puzzle <a href={`https://lichess.org/training/${puzzle?._id}`} target="_blank" rel="noreferrer" className="text-[#3893e8] hover:underline">#{puzzle?._id ? puzzle._id.toString().slice(0, 6) : "hidden"}</a></div>
                  <div className="text-[#8b8987] text-xs mt-1">Rating: hidden</div>
                  <div className="text-[#8b8987] text-xs">Played 27,539 times</div>
                </div>
              </div>
              <div className="flex items-start gap-3 pt-4 border-t border-[#3a3836]">
                <div className="text-2xl mt-1">🐢</div>
                <div>
                  <div className="text-[#8b8987] text-xs mb-1">From game {puzzle?.game_id || "Unknown"}</div>
                  <div className="text-[#bababa] text-xs flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-white inline-block"></span>
                    {puzzle?.playercolor === "white" ? "Player (1600)" : "Opponent (1600)"}
                  </div>
                  <div className="text-[#bababa] text-xs flex items-center gap-1 mt-1">
                    <span className="w-2 h-2 rounded-full bg-black border border-[#8b8987] inline-block"></span>
                    {puzzle?.playercolor === "black" ? "Player (1600)" : "Opponent (1600)"}
                  </div>
                </div>
              </div>

              <div className="bg-[#302e2c] p-3 rounded mt-6 border border-[#3a3836]">
                <div className="text-xs text-[#8b8987] mb-2">To get personalized puzzles:</div>
                <button className="bg-[#5c60c8] hover:bg-[#6c70d8] text-white text-xs font-semibold py-1.5 px-4 rounded transition">REGISTER</button>
              </div>
            </div>

            <div className="bg-[#262421] rounded p-4 text-sm border border-[#3a3836]">
              <div className="text-[#3893e8] hover:underline cursor-pointer mb-2">« Puzzle Themes</div>
              <div className="text-xs text-[#8b8987] leading-relaxed">A mix of everything. You don't know what to expect, so you remain ready for anything! Just like in real games!</div>
            </div>

            <div className="bg-[#262421] rounded p-4 text-sm flex items-center gap-3 border border-[#3a3836] cursor-pointer" onClick={() => setAutoAdvance(!autoAdvance)}>
              <div className={`w-8 h-4 rounded-full flex items-center transition-colors p-0.5 ${autoAdvance ? 'bg-[#629924]' : 'bg-[#3a3836]'}`}>
                <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${autoAdvance ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs text-[#8b8987] select-none">Jump to next puzzle immediately</span>
            </div>
          </div>

          {/* Middle: Board */}
          <div className="flex-1 flex flex-col items-center max-w-[700px]">
            <div className="flex w-full gap-2">
              {/* Eval bar */}
              <div className="hidden sm:block w-4 sm:w-6 flex-shrink-0">
                <EvalBar score={currentEval.score} mate={currentEval.mate} flipped={isFlipped} />
              </div>

              {/* Chessboard Wrapper to prevent stretching */}
              <div className="flex-1 w-full flex flex-col">
                <div className="w-full aspect-square relative">
                  <Chessboard
                    options={{
                      position: currentFen,
                      onPieceDrop: handlePieceDrop,
                      boardOrientation: isFlipped ? "black" : "white",
                      arrows: formattedArrows,
                      darkSquareStyle: { backgroundColor: "#706b5c" },
                      lightSquareStyle: { backgroundColor: "#b7b093" },
                      boardStyle: { width: "100%", height: "100%", aspectRatio: "1/1" },
                    }}
                  />
                </div>

                {/* Navigation and Progress below board */}
                <div className="mt-4 flex flex-col gap-2 w-full">
                  <div className="flex items-center justify-between bg-[#262421] rounded border border-[#3a3836] px-4 py-2">
                    <button
                      onClick={goToPrevPuzzle}
                      disabled={puzzleIndex === 0}
                      className="text-[#8b8987] hover:text-white disabled:opacity-30 disabled:hover:text-[#8b8987] transition flex items-center gap-2"
                    >
                      <span className="text-xl">«</span> Prev
                    </button>
                    <span className="text-sm text-[#bababa]">Puzzle {puzzleIndex + 1} of {puzzles.length}</span>
                    <button
                      onClick={goToNextPuzzle}
                      disabled={puzzleIndex >= puzzles.length - 1}
                      className="text-[#8b8987] hover:text-white disabled:opacity-30 disabled:hover:text-[#8b8987] transition flex items-center gap-2"
                    >
                      Next <span className="text-xl">»</span>
                    </button>
                  </div>

                  <div className="rounded overflow-hidden w-full border border-[#3a3836]">
                    <PuzzleProgress
                      attempts={attempts}
                      currentIndex={puzzleIndex}
                      total={puzzles.length}
                      onJump={setPuzzleIndex}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Panel */}
          <div className="w-full lg:w-96 flex flex-col bg-[#262421] rounded overflow-hidden h-fit border border-[#3a3836]">

            {/* Puzzle info */}
            <div className="px-4 py-3 bg-[#302e2c] border-b border-[#3a3836]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${puzzle?.issuetype === "blunder" ? "bg-[#cc3333]/20 text-[#ff6b6b]" :
                      puzzle?.issuetype === "mistake" ? "bg-orange-500/20 text-orange-300" :
                        "bg-yellow-500/20 text-yellow-300"
                    }`}>
                    {puzzle?.issuetype?.replace("_", " ")}
                  </span>
                  <span className="text-sm text-[#8b8987]">
                    Move {puzzle?.moveindex}
                  </span>
                </div>
                <a
                  href={`https://www.chess.com/game/live/${puzzle?.game_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#8b8987] hover:text-[#3893e8]"
                >
                  View game →
                </a>
              </div>

              {/* Status */}
              <div className={`mt-2 text-lg font-semibold ${status === "correct" ? "text-[#629924]" :
                  status === "wrong" ? "text-[#cc3333]" :
                    status === "solution" ? "text-[#8b8987]" :
                      "text-white"
                }`}>
                {isPlayingLine && <span className="animate-pulse">▶ Playing line...</span>}
                {!isPlayingLine && status === "playing" && `${puzzle?.sidetomove === "w" ? "White" : "Black"} to play`}
                {!isPlayingLine && status === "correct" && "✓ Correct!"}
                {!isPlayingLine && status === "wrong" && `✗ Best was ${bestMoveSan}`}
                {!isPlayingLine && status === "solution" && "Solution shown"}
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-2 px-4 py-3 border-b border-[#3a3836]">
              {status === "playing" ? (
                <>
                  <button
                    onClick={handleGetHint}
                    className="flex-1 py-2 px-3 text-sm bg-[#302e2c] hover:bg-[#3a3836] rounded transition"
                  >
                    💡 Hint
                  </button>
                  <button
                    onClick={handleViewSolution}
                    className="flex-1 py-2 px-3 text-sm bg-[#302e2c] hover:bg-[#3a3836] rounded transition"
                  >
                    📖 Solution
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleRetry}
                    className="flex-1 py-2 px-3 text-sm bg-[#302e2c] hover:bg-[#3a3836] rounded transition"
                  >
                    ↺ Retry
                  </button>
                  <button
                    onClick={goToNextPuzzle}
                    disabled={puzzleIndex >= puzzles.length - 1}
                    className="flex-1 py-2 px-3 text-sm bg-[#629924] hover:bg-[#729934] text-white rounded transition disabled:opacity-50"
                  >
                    Next →
                  </button>
                </>
              )}
            </div>

            {/* Move navigator */}
            <div className="border-b border-[#3a3836]">
              <MoveNavigator
                moves={moveHistory}
                currentIndex={currentMoveIndex}
                onNavigate={navigateToMove}
                startingMoveNumber={puzzle?.moveindex || 1}
              />
            </div>

            {/* Engine lines */}
            <EngineLines
              lines={engineLines}
              isAnalyzing={isAnalyzing}
              depth={engineDepth}
              enabled={showEngine}
              onToggle={() => setShowEngine(!showEngine)}
              onAnalyze={() => {
                console.log("🖱️ Analyze button clicked!", { currentFen });
                if (currentFen) {
                  analyzePosition(currentFen, true);
                } else {
                  console.error("❌ No FEN to analyze!");
                }
              }}
              onLineClick={(idx) => {
                // Play just the first move of the engine line
                if (isPlayingLine) return;
                const line = engineLines[idx];
                if (!line || !puzzle || !line.pv.length) return;

                try {
                  const game = new Chess(currentFen);
                  const uci = line.pv[0]; // Only first move
                  const move = game.move({
                    from: uci.slice(0, 2) as Square,
                    to: uci.slice(2, 4) as Square,
                    promotion: uci.length > 4 ? uci[4] : undefined,
                  });
                  
                  if (move) {
                    // Update position with just the first move
                    const newFen = game.fen();
                    setPositionHistory(prev => [...prev.slice(0, currentMoveIndex + 2), newFen]);
                    setMoveHistory(prev => [...prev.slice(0, currentMoveIndex + 1), move.san]);
                    setCurrentMoveIndex(prev => prev + 1);
                  }
                } catch {
                  // Ignore invalid moves
                }
              }}
            />

            {/* Spacer */}
            <div className="flex-1" />

            {/* Keyboard hints */}
            <div className="px-4 py-2 border-t border-[#3a3836] text-[10px] text-[#6e6c6a]">
              <span className="mr-3">←/→ moves</span>
              <span className="mr-3">↑/↓ puzzles</span>
              <span className="mr-3">h hint</span>
              <span>s solution</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PuzzlesPage;
