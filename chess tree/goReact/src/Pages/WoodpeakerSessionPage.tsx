import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Swords,
  Target,
  XCircle,
} from "lucide-react";
import { ChessBoard, type PremoveState } from "swiftchess";
import "swiftchess/style.css";
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { cn } from "@/lib/utils";
import ClockComponent from "@/Utils/ClockComponnet";

interface WoodpeakerSession {
  _id: string;
  title: string;
  totalpuzzles: number;
  status: string;
  updatedat: string;
  themes: string[];
  minrating: number;
  maxrating: number;
  createdat: string;
}

interface PuzzleItem {
  _id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  openingtags: string[];
  position: number;
}

type PuzzleFeedback = "idle" | "correct" | "wrong" | "solved";

const LICHESS_LIGHT_SQUARE = "#f0d9b5";
const LICHESS_DARK_SQUARE = "#b58863";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const START_BOARD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  return [];
};

const sanitizeFen = (fen: unknown): string => {
  const raw = String(fen ?? "").trim();
  const parts = raw ? raw.split(/\s+/).filter(Boolean) : [];
  const castling = parts[2];
  const enPassant = parts[3];
  const halfmove = parts[4];
  const fullmove = parts[5];
  const six = [
    parts[0] ?? START_BOARD,
    parts[1] === "b" ? "b" : "w",
    castling && /^(-|[KQkq]{1,4})$/.test(castling) ? castling : "-",
    enPassant && /^(-|[a-h][36])$/.test(enPassant) ? enPassant : "-",
    halfmove && /^\d+$/.test(halfmove) ? halfmove : "0",
    fullmove && /^[1-9]\d*$/.test(fullmove) ? fullmove : "1",
  ];
  return six.join(" ");
};

const normalizePuzzle = (value: unknown): PuzzleItem => {
  const item = value as Record<string, unknown>;
  return {
    _id: String(item?._id ?? ""),
    fen: sanitizeFen(item?.fen),
    moves: normalizeStringArray(item?.moves).map((m) => m.toLowerCase()),
    rating: Number(item?.rating ?? 0),
    themes: normalizeStringArray(item?.themes),
    openingtags: normalizeStringArray(item?.openingtags),
    position: Number(item?.position ?? 0),
  };
};

const parseUciMove = (uci: string): { from: Square; to: Square; promotion?: PieceSymbol } | null => {
  const normalized = uci.trim().toLowerCase();
  if (normalized.length < 4) return null;
  const from = normalized.slice(0, 2) as Square;
  const to = normalized.slice(2, 4) as Square;
  const promo = normalized[4];
  const promotion = promo && ["q", "r", "b", "n"].includes(promo) ? (promo as PieceSymbol) : undefined;
  return { from, to, promotion };
};

const getUserColorFromFen = (fen: string): Color => {
  const parts = sanitizeFen(fen).split(" ");
  const activeColor = parts[1];
  return activeColor === "b" ? "w" : "b";
};

const getExpectedUciKey = (uci: string) => {
  const normalized = uci.trim().toLowerCase();
  return normalized.length >= 5 ? normalized.slice(0, 5) : normalized.slice(0, 4);
};

const getMoveUciKey = (from: string, to: string, promotion?: string) => {
  return `${from}${to}${promotion ?? ""}`.toLowerCase();
};

interface PuzzleBoardProps {
  puzzle: PuzzleItem;
  onSolved: () => void;
  onFailed: () => void;
  onUserMoveStart?: () => void;
  onPuzzleReady?: () => void;
  initialMoveDelay?: number;
}

function PuzzleBoard({ puzzle, onSolved, onFailed, onUserMoveStart, onPuzzleReady, initialMoveDelay = 150 }: PuzzleBoardProps) {
  const chessRef = useRef<Chess>(new Chess());
  const [position, setPosition] = useState<string>(START_FEN);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [isUserTurn, setIsUserTurn] = useState(false);
  const [feedback, setFeedback] = useState<PuzzleFeedback>("idle");
  const [premoves, setPremoves] = useState<PremoveState[]>([]);
  const [isInputLocked, setIsInputLocked] = useState(false);
  const [boardVisible, setBoardVisible] = useState(false);
  const autoMoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRafOneRef = useRef<number | null>(null);
  const readyRafTwoRef = useRef<number | null>(null);

  const clearAutoMove = () => {
    if (autoMoveRef.current) {
      clearTimeout(autoMoveRef.current);
      autoMoveRef.current = null;
    }
  };

  const clearFeedbackReset = useCallback(() => {
    if (feedbackResetRef.current) {
      clearTimeout(feedbackResetRef.current);
      feedbackResetRef.current = null;
    }
  }, []);

  const clearPremoves = useCallback(() => {
    setPremoves([]);
  }, []);

  const clearReadyRafs = useCallback(() => {
    if (readyRafOneRef.current !== null) {
      cancelAnimationFrame(readyRafOneRef.current);
      readyRafOneRef.current = null;
    }
    if (readyRafTwoRef.current !== null) {
      cancelAnimationFrame(readyRafTwoRef.current);
      readyRafTwoRef.current = null;
    }
  }, []);

  const notifyPuzzleReadyAfterPaint = useCallback(() => {
    clearReadyRafs();
    readyRafOneRef.current = requestAnimationFrame(() => {
      readyRafOneRef.current = null;
      readyRafTwoRef.current = requestAnimationFrame(() => {
        readyRafTwoRef.current = null;
        setBoardVisible(true);
        onPuzzleReady?.();
      });
    });
  }, [clearReadyRafs, onPuzzleReady]);

  const clearPuzzleTimers = useCallback(() => {
    clearAutoMove();
    clearFeedbackReset();
    clearReadyRafs();
  }, [clearFeedbackReset, clearReadyRafs]);

  const userColor = useMemo(() => getUserColorFromFen(puzzle.fen), [puzzle.fen]);

  useEffect(() => {
    clearPuzzleTimers();
    clearPremoves();
    setIsInputLocked(false);
    setBoardVisible(false);
    try {
      const chess = new Chess();
      chess.load(sanitizeFen(puzzle.fen));
      chessRef.current = chess;

      setPosition(chess.fen());
      setCurrentMoveIndex(0);
      setFeedback("idle");

      if (puzzle.moves.length === 0) {
        notifyPuzzleReadyAfterPaint();
        onSolved();
        return;
      }

      setIsUserTurn(false);
      autoMoveRef.current = setTimeout(() => {
        playMoveOnBoard(chess, puzzle.moves[0]);
        setCurrentMoveIndex(1);
        setIsUserTurn(true);
        setFeedback("idle");
        notifyPuzzleReadyAfterPaint();
      }, initialMoveDelay);
    } catch (err) {
      console.error("Failed to load puzzle FEN:", puzzle.fen, err);
      setBoardVisible(true);
      notifyPuzzleReadyAfterPaint();
    }

    return () => {
      clearPuzzleTimers();
    };
  }, [clearPremoves, clearPuzzleTimers, notifyPuzzleReadyAfterPaint, onSolved, puzzle._id, puzzle.fen, puzzle.moves, initialMoveDelay]);

  const playMoveOnBoard = (chess: Chess, uci: string): boolean => {
    const parsed = parseUciMove(uci);
    if (!parsed) return false;
    const result = chess.move(parsed);
    if (!result) return false;
    setPosition(chess.fen());
    return true;
  };

  const showFeedback = useCallback((type: PuzzleFeedback) => {
    setFeedback(type);
  }, []);

  const handleWrongMove = useCallback(() => {
    showFeedback("wrong");
    setIsInputLocked(true);
    onFailed();
    clearPremoves();
    clearFeedbackReset();
    feedbackResetRef.current = setTimeout(() => {
      setFeedback("idle");
      setIsInputLocked(false);
      feedbackResetRef.current = null;
    }, 900);
  }, [clearFeedbackReset, clearPremoves, onFailed, showFeedback]);

  const handleBoardMove = useCallback((move: Move) => {
    if (feedback === "solved") {
      chessRef.current.undo();
      setPosition(chessRef.current.fen());
      return;
    }

    const expectedUci = puzzle.moves[currentMoveIndex];
    if (!expectedUci || isInputLocked) {
      chessRef.current.undo();
      setPosition(chessRef.current.fen());
      return;
    }

    const playedUciKey = getMoveUciKey(move.from, move.to, move.promotion);
    const expectedUciKey = getExpectedUciKey(expectedUci);
    if (playedUciKey !== expectedUciKey) {
      chessRef.current.undo();
      setPosition(chessRef.current.fen());
      handleWrongMove();
      return;
    }

    onUserMoveStart?.();
    showFeedback("correct");
    clearPremoves();

    const nextUserMoveIndex = currentMoveIndex + 2;
    if (currentMoveIndex + 1 >= puzzle.moves.length) {
      setIsUserTurn(false);
      setIsInputLocked(true);
      setTimeout(() => {
        showFeedback("solved");
        setTimeout(onSolved, 250);
      }, 250);
      return;
    }

    setIsUserTurn(false);
    const opponentUci = puzzle.moves[currentMoveIndex + 1];
    autoMoveRef.current = setTimeout(() => {
      const opponentParsed = parseUciMove(opponentUci);
      if (opponentParsed) {
        const result = chessRef.current.move(opponentParsed);
        if (result) {
          setPosition(chessRef.current.fen());
        }
      }

      if (nextUserMoveIndex >= puzzle.moves.length) {
        setIsInputLocked(true);
        setTimeout(() => {
          showFeedback("solved");
          setIsUserTurn(false);
          setTimeout(onSolved, 250);
        }, 200);
        return;
      }

      setCurrentMoveIndex(nextUserMoveIndex);
      setIsUserTurn(true);
      setFeedback("idle");
    }, 500);
  }, [
    clearPremoves,
    currentMoveIndex,
    feedback,
    handleWrongMove,
    isInputLocked,
    isUserTurn,
    onSolved,
    onUserMoveStart,
    puzzle.moves,
    showFeedback,
  ]);

  const canQueuePremove = useCallback(({ premove: _premove }: { premove: PremoveState }) => {
    if (feedback === "solved" || isInputLocked || isUserTurn) return false;
    return true;
  }, [feedback, isInputLocked, isUserTurn]);

  const boardPlayerColor: Color = isInputLocked && feedback !== "idle"
    ? (userColor === "w" ? "b" : "w")
    : userColor;
  const boardFlipped = userColor === "b";

  const totalMoves = Math.ceil((puzzle.moves.length - 1) / 2);
  const completedMoves = Math.floor((currentMoveIndex - 1) / 2);

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className={cn(
        "h-8 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-300",
        feedback === "correct" && "bg-green-500/15 text-green-400",
        feedback === "wrong" && "bg-red-500/15 text-red-400",
        feedback === "solved" && "bg-green-500/20 text-green-300",
        feedback === "idle" && "bg-white/[0.03] text-white/30",
      )}>
        {feedback === "correct" && <><CheckCircle2 size={15} /> Good move!</>}
        {feedback === "wrong" && <><XCircle size={15} /> Wrong — try again</>}
        {feedback === "solved" && <><CheckCircle2 size={15} /> Puzzle solved! ✓</>}
        {feedback === "idle" && (isUserTurn ? "Your turn" : "Opponent thinking…")}
      </div>

      <div className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/[0.07]">
        <div className="w-full aspect-square">
          <ChessBoard
            chess={chessRef.current}
            position={position}
            onPositionChange={setPosition}
            onMove={handleBoardMove}
            playerColor={boardPlayerColor}
            flipped={boardFlipped}
            premoves={premoves}
            onPremovesChange={setPremoves}
            canQueuePremove={canQueuePremove}
            boardThemePreset="chessComClassic"
            boardTheme={{
              light: LICHESS_LIGHT_SQUARE,
              dark: LICHESS_DARK_SQUARE,
            }}
            enableSounds={true}
            fillContainer={true}
            className={cn(
              "w-full h-full transition-opacity duration-100",
              boardVisible ? "opacity-100" : "opacity-0"
            )}
          />
        </div>
      </div>

      {totalMoves > 0 && (
        <div className="flex items-center justify-center gap-1.5 mt-1">
          {Array.from({ length: totalMoves }).map((_, i) => (
            <div key={i} className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              i < completedMoves ? "bg-green-400" : i === completedMoves ? "bg-white/60" : "bg-white/15"
            )} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WoodpeakerSessionPage() {
  const { id: sessionId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const sessionFromState = (location.state as { session?: WoodpeakerSession } | null)?.session ?? null;

  const [session, setSession] = useState<WoodpeakerSession | null>(sessionFromState);
  const [puzzles, setPuzzles] = useState<PuzzleItem[]>([]);
  const [puzzleLoading, setPuzzleLoading] = useState(true);
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [clockRunning, setClockRunning] = useState(false);
  const [clockResetToken, setClockResetToken] = useState(0);
  const [boardTransitioning, setBoardTransitioning] = useState(false);

  const clockElapsedRef = useRef(0);
  const timeBucketsRef = useRef<number[]>([]);
  const bucketSubmittedRef = useRef(false);
  const sessionStartedRef = useRef(false);

  const handleClockElapsedChange = useCallback((elapsedMs: number) => {
    clockElapsedRef.current = elapsedMs;
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (sessionFromState?._id === sessionId) {
      setSession(sessionFromState);
      return;
    }

    const loadSessionMeta = async () => {
      try {
        const { data } = await axios.get("http://localhost:3030/woodpeaker/list", { withCredentials: true });
        const list = Array.isArray(data?.data) ? data.data : [];
        const found = list.find((item: unknown) => String((item as { _id?: string })?._id ?? "") === sessionId);
        setSession(found ?? null);
      } catch (err) {
        console.error(err);
      }
    };

    loadSessionMeta();
  }, [sessionId, sessionFromState]);

  useEffect(() => {
    if (!sessionId) return;

    const load = async () => {
      setPuzzleLoading(true);
      setClockRunning(false);
      clockElapsedRef.current = 0;
      timeBucketsRef.current = [];
      bucketSubmittedRef.current = false;
      sessionStartedRef.current = false;
      setClockResetToken((value) => value + 1);
      setScore({ correct: 0, wrong: 0 });
      setBoardTransitioning(true);

      try {
        const { data } = await axios.get(`http://localhost:3030/woodpeaker/item/${sessionId}`, { withCredentials: true });
        const normalized = Array.isArray(data?.data)
          ? (data.data as unknown[]).map(normalizePuzzle)
          : [];

        setPuzzles(normalized);
        setCurrentPuzzleIndex(0);
        setBoardTransitioning(normalized.length > 0);
        if (normalized.length === 0) setClockRunning(false);
      } catch (err) {
        console.error(err);
      } finally {
        setPuzzleLoading(false);
      }
    };

    load();
  }, [sessionId]);

  const currentPuzzle = puzzles[currentPuzzleIndex];

  const pushTimestampBucket = useCallback((elapsedMs: number) => {
    const nextBucket = [...timeBucketsRef.current, elapsedMs];
    timeBucketsRef.current = nextBucket;
    return nextBucket;
  }, []);

  const ensureSessionStarted = useCallback(() => {
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    setClockRunning(true);
  }, []);

  const sendBucketToBackend = useCallback(async (bucket: number[]) => {
    if (bucketSubmittedRef.current || bucket.length === 0) return;
    try {
      console.log("score:", score)
      await axios.post("http://localhost:3030/woodpeaker/result", {
        bucket,
        sessionId,
        solvedClean: score.correct,
        Failed: score.wrong,
        totalTimeMs: bucket.reduce((a, b) => a + b, 0),
      }, { withCredentials: true });
      bucketSubmittedRef.current = true;
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleSolved = useCallback(() => {
    const solvedPuzzle = puzzles[currentPuzzleIndex];
    if (!solvedPuzzle) return;

    const elapsedMs = clockElapsedRef.current;
    const nextBucket = pushTimestampBucket(elapsedMs);
    setScore((s) => ({ ...s, correct: s.correct + 1 }));

    const nextIndex = currentPuzzleIndex + 1;
    if (nextIndex >= puzzles.length) {
      setClockRunning(false);
      sendBucketToBackend(nextBucket);
      return;
    }

    // Step 1: paint skeleton first
    setBoardTransitioning(true);
    // Step 2: only mount new PuzzleBoard after skeleton is on screen
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCurrentPuzzleIndex(nextIndex);
      });
    });
  }, [puzzles, currentPuzzleIndex, pushTimestampBucket, sendBucketToBackend]);

  const handleFailed = useCallback(() => {
    setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
  }, []);

  const handlePuzzleReady = useCallback(() => {
    setBoardTransitioning(false);
  }, []);

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= puzzles.length) return;
    if (idx > currentPuzzleIndex) {
      pushTimestampBucket(clockElapsedRef.current);
    }
    setBoardTransitioning(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCurrentPuzzleIndex(idx);
      });
    });
  };

  const progressWidth = useMemo(() => {
    if (!puzzles.length) return "0%";
    return `${(currentPuzzleIndex / puzzles.length) * 100}%`;
  }, [currentPuzzleIndex, puzzles.length]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate("/wood")} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Sessions</span>
        </button>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-green-400 font-medium">
            <CheckCircle2 size={14} /> {score.correct}
          </span>
          <span className="flex items-center gap-1.5 text-red-400 font-medium">
            <XCircle size={14} /> {score.wrong}
          </span>
          <span className="text-white/40">
            {currentPuzzleIndex + 1} / {puzzles.length}
          </span>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full">
        {puzzleLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="animate-spin text-white/50 w-8 h-8 mb-4" />
            <p className="text-white/50 text-sm">Loading puzzles...</p>
          </div>
        ) : !currentPuzzle ? (
          <div className="text-center text-white/50 py-20">No puzzles found for this session.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
            <div className="w-full max-w-[760px] mx-auto lg:mx-0">
              <div className="relative">
                <PuzzleBoard
                  key={`${currentPuzzle._id}-${currentPuzzleIndex}`}
                  puzzle={currentPuzzle}
                  onSolved={handleSolved}
                  onFailed={handleFailed}
                  onUserMoveStart={ensureSessionStarted}
                  onPuzzleReady={handlePuzzleReady}
                  initialMoveDelay={150}
                />
                {boardTransitioning && (
                  <div className="absolute inset-0 z-20 rounded-2xl overflow-hidden pointer-events-none">
                    <div className="h-8 rounded-xl bg-white/[0.03]" />
                    <div className="mt-3 w-full aspect-square rounded-2xl animate-pulse bg-zinc-900" />
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/15" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{session?.title || "Woodpecker Session"}</h2>
                <p className="text-sm text-white/40 mt-1">Puzzle {currentPuzzleIndex + 1} of {puzzles.length}</p>
              </div>

              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/60 rounded-full transition-all duration-500"
                  style={{ width: progressWidth }}
                />
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Target className="text-white/40" size={18} />
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Rating</p>
                    <p className="text-sm font-medium">{currentPuzzle.rating}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Swords className="text-white/40 mt-0.5" size={18} />
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-1">Themes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {currentPuzzle.themes?.map((theme) => (
                        <span key={theme} className="px-2 py-1 bg-white/10 rounded-md text-xs">{theme}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4 grid grid-cols-2 gap-3">
                  <div className="bg-green-500/10 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-400">{score.correct}</p>
                    <p className="text-[11px] text-green-400/70 uppercase tracking-wider">Solved</p>
                  </div>
                  <div className="bg-red-500/10 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{score.wrong}</p>
                    <p className="text-[11px] text-red-400/70 uppercase tracking-wider">Mistakes</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  disabled={currentPuzzleIndex === 0}
                  onClick={() => goTo(currentPuzzleIndex - 1)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={currentPuzzleIndex === puzzles.length - 1}
                  onClick={() => goTo(currentPuzzleIndex + 1)}
                  className="flex-1 py-3 rounded-xl bg-white text-zinc-900 hover:bg-white/90 text-sm font-semibold transition-colors disabled:opacity-30"
                >
                  Skip
                </button>
              </div>
              <div className="flex">
                <ClockComponent
                  running={clockRunning}
                  resetToken={clockResetToken}
                  onElapsedChange={handleClockElapsedChange}
                />
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
