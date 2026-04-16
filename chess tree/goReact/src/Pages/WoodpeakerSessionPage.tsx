import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Swords,
  Target,
  XCircle,
} from "lucide-react";
import {
  Chessboard,
  defaultPieces,
  type PieceDropHandlerArgs,
  type PieceHandlerArgs,
  type PieceRenderObject,
  type SquareHandlerArgs,
} from "react-chessboard";
import { Chess, type PieceSymbol, type Square } from "chess.js";
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

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  return [];
};

const normalizePuzzle = (value: unknown): PuzzleItem => {
  const item = value as Record<string, unknown>;
  return {
    _id: String(item?._id ?? ""),
    fen: String(item?.fen ?? ""),
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

const getBoardOrientationFromFen = (fen: string): "white" | "black" => {
  const parts = fen.trim().split(" ");
  const activeColor = parts[1];
  return activeColor === "b" ? "white" : "black";
};

interface PuzzleBoardProps {
  puzzle: PuzzleItem;
  onSolved: () => void;
  onFailed: () => void;
  onUserMoveStart?: () => void;
}

function PuzzleBoard({ puzzle, onSolved, onFailed, onUserMoveStart }: PuzzleBoardProps) {
  type QueuedPremove = {
    sourceSquare: string;
    targetSquare: string;
    pieceType: string;
    promotion?: PieceSymbol;
  };
  type PendingPromotion = {
    sourceSquare: string;
    targetSquare: string;
    pieceColor: "w" | "b";
    mode: "move" | "premove";
  };

  const chessRef = useRef<Chess>(new Chess());
  const [position, setPosition] = useState<string>("");
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [isUserTurn, setIsUserTurn] = useState(false);
  const [feedback, setFeedback] = useState<PuzzleFeedback>("idle");
  const [highlightSquares, setHighlightSquares] = useState<Record<string, React.CSSProperties>>({});
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [clickMoveTargets, setClickMoveTargets] = useState<string[]>([]);
  const [premoves, setPremoves] = useState<QueuedPremove[]>([]);
  const premovesRef = useRef<QueuedPremove[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const autoMoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const premoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExecutingPremoveRef = useRef(false);

  const clearAutoMove = () => {
    if (autoMoveRef.current) {
      clearTimeout(autoMoveRef.current);
      autoMoveRef.current = null;
    }
  };




  const clearPremoveTimer = useCallback(() => {
    if (premoveTimerRef.current) {
      clearTimeout(premoveTimerRef.current);
      premoveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearAutoMove();
    clearPremoveTimer();
    isExecutingPremoveRef.current = false;
    premovesRef.current = [];
    setPremoves([]);
    setPendingPromotion(null);

    try {
      const chess = new Chess();
      chess.load(puzzle.fen);
      chessRef.current = chess;

      const orientation = getBoardOrientationFromFen(puzzle.fen);
      setBoardOrientation(orientation);
      setPosition(chess.fen());
      setCurrentMoveIndex(0);
      setFeedback("idle");
      setHighlightSquares({});
      setSelectedSquare(null);
      setClickMoveTargets([]);

      if (puzzle.moves.length === 0) {
        onSolved();
        return;
      }

      setIsUserTurn(false);
      autoMoveRef.current = setTimeout(() => {
        playMoveOnBoard(chess, puzzle.moves[0]);
        setCurrentMoveIndex(1);
        setIsUserTurn(true);
      }, 400);
    } catch (err) {
      console.error("Failed to load puzzle FEN:", puzzle.fen, err);
    }

    return () => {
      clearAutoMove();
      clearPremoveTimer();
      isExecutingPremoveRef.current = false;
    };
  }, [puzzle._id, clearPremoveTimer, onSolved, puzzle.fen, puzzle.moves]);

  const playMoveOnBoard = (chess: Chess, uci: string): boolean => {
    const parsed = parseUciMove(uci);
    if (!parsed) return false;
    const result = chess.move(parsed);
    if (!result) return false;
    setPosition(chess.fen());
    return true;
  };

  const showFeedback = (type: PuzzleFeedback, squares?: Record<string, React.CSSProperties>) => {
    setFeedback(type);
    if (squares) setHighlightSquares(squares);
    else setHighlightSquares({});
  };

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setClickMoveTargets([]);
  }, []);

  const userColor = boardOrientation === "white" ? "w" : "b";

  const clearPremoves = useCallback(() => {
    clearPremoveTimer();
    isExecutingPremoveRef.current = false;
    premovesRef.current = [];
    setPremoves([]);
  }, [clearPremoveTimer]);

  const queuePremove = useCallback((move: QueuedPremove) => {
    premovesRef.current.push(move);
    setPremoves([...premovesRef.current]);
  }, []);

  const isPromotionTarget = useCallback((pieceType: string, targetSquare: string) => {
    if (pieceType[1]?.toLowerCase() !== "p") return false;
    const rank = targetSquare.slice(-1);
    const color = pieceType[0];
    return (color === "w" && rank === "8") || (color === "b" && rank === "1");
  }, []);

  const selectSquareForMove = useCallback(
    (square: string) => {
      const chess = chessRef.current;
      const piece = chess.get(square as Square);
      if (!piece || piece.color !== userColor) {
        clearSelection();
        return;
      }

      const legalTargets = chess.moves({ square: square as Square, verbose: true }).map((move) => move.to);
      if (legalTargets.length === 0) {
        clearSelection();
        return;
      }

      setSelectedSquare(square);
      setClickMoveTargets(legalTargets);
    },
    [clearSelection, userColor]
  );

  const squareStyles = useMemo(() => {
    const moveHintStyles: Record<string, React.CSSProperties> = {};
    const premoveStyles: Record<string, React.CSSProperties> = {};

    if (selectedSquare) {
      moveHintStyles[selectedSquare] = { backgroundColor: "rgba(59,130,246,0.35)" };
    }
    for (const square of clickMoveTargets) {
      moveHintStyles[square] = {
        ...(moveHintStyles[square] ?? {}),
        boxShadow: "inset 0 0 0 4px rgba(59,130,246,0.4)",
      };
    }

    for (const premove of premoves) {
      premoveStyles[premove.sourceSquare] = { backgroundColor: "rgba(239,68,68,0.28)" };
      premoveStyles[premove.targetSquare] = { backgroundColor: "rgba(239,68,68,0.2)" };
    }

    return { ...moveHintStyles, ...premoveStyles, ...highlightSquares };
  }, [selectedSquare, clickMoveTargets, premoves, highlightSquares]);

  const handleUserMove = useCallback(
    (sourceSquare: string, targetSquare: string, promotion?: PieceSymbol): boolean => {
      if (!isUserTurn || feedback === "wrong" || feedback === "solved") return false;

      const expectedUci = puzzle.moves[currentMoveIndex];
      if (!expectedUci) return false;

      const chess = chessRef.current;
      const sourcePiece = chess.get(sourceSquare as Square);
      if (!sourcePiece || sourcePiece.color !== userColor) {
        return false;
      }
      const legalMoves = chess.moves({ square: sourceSquare as Square, verbose: true })
        .filter((move) => move.to === targetSquare);
      if (legalMoves.length === 0) return false;
      onUserMoveStart?.();

      const requiresPromotion = legalMoves.some((move) => Boolean(move.promotion));
      if (requiresPromotion && !promotion) {
        setPendingPromotion({
          sourceSquare,
          targetSquare,
          pieceColor: sourcePiece.color,
          mode: "move",
        });
        clearSelection();
        return true;
      }
      if (promotion && requiresPromotion && !legalMoves.some((move) => move.promotion === promotion)) {
        return false;
      }

      clearSelection();

      const playedUci = `${sourceSquare}${targetSquare}${promotion ?? ""}`.toLowerCase();
      const expectedKey = expectedUci.length >= 5
        ? expectedUci.slice(0, 5).toLowerCase()
        : expectedUci.slice(0, 4).toLowerCase();

      if (playedUci !== expectedKey) {
        showFeedback("wrong", {
          [sourceSquare]: { backgroundColor: "rgba(239,68,68,0.5)" },
          [targetSquare]: { backgroundColor: "rgba(239,68,68,0.35)" },
        });
        setTimeout(() => {
          setFeedback("idle");
          setHighlightSquares({});
        }, 900);
        onFailed();
        return false;
      }

      const result = chess.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        ...(promotion ? { promotion } : {}),
      });
      if (!result) return false;

      setPosition(chess.fen());
      showFeedback("correct", {
        [result.from]: { backgroundColor: "rgba(34,197,94,0.45)" },
        [result.to]: { backgroundColor: "rgba(34,197,94,0.45)" },
      });

      const nextUserMoveIndex = currentMoveIndex + 2;

      if (currentMoveIndex + 1 >= puzzle.moves.length) {
        setTimeout(() => {
          showFeedback("solved");
          setIsUserTurn(false);
          setTimeout(onSolved, 250);
        }, 250);
        return true;
      }

      setIsUserTurn(false);
      const opponentUci = puzzle.moves[currentMoveIndex + 1];

      autoMoveRef.current = setTimeout(() => {
        setHighlightSquares({});
        const opponentParsed = parseUciMove(opponentUci);
        if (opponentParsed) {
          const opponentResult = chess.move(opponentParsed);
          if (opponentResult) {
            setPosition(chess.fen());
            setHighlightSquares({
              [opponentResult.from]: { backgroundColor: "rgba(255,200,0,0.35)" },
              [opponentResult.to]: { backgroundColor: "rgba(255,200,0,0.35)" },
            });
          }
        }

        if (nextUserMoveIndex >= puzzle.moves.length) {
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

      return true;
    },
    [puzzle, currentMoveIndex, isUserTurn, feedback, clearSelection, onSolved, onFailed, onUserMoveStart, userColor]
  );

  const tryExecuteQueuedPremove = useCallback(() => {
    if (!isUserTurn || feedback === "wrong" || feedback === "solved" || pendingPromotion) return;
    if (premoveTimerRef.current || isExecutingPremoveRef.current) return;
    if (premovesRef.current.length === 0) return;

    premoveTimerRef.current = setTimeout(() => {
      premoveTimerRef.current = null;
      const nextPremove = premovesRef.current[0];
      if (!nextPremove) return;

      premovesRef.current.splice(0, 1);
      setPremoves([...premovesRef.current]);
      isExecutingPremoveRef.current = true;

      const success = handleUserMove(
        nextPremove.sourceSquare,
        nextPremove.targetSquare,
        nextPremove.promotion
      );
      isExecutingPremoveRef.current = false;

      if (!success) {
        clearPremoves();
      }
    }, 250);
  }, [isUserTurn, feedback, pendingPromotion, handleUserMove, clearPremoves]
  );

  useEffect(() => {
    tryExecuteQueuedPremove();
  }, [tryExecuteQueuedPremove, premoves]);

  const onPromotionPieceSelect = useCallback((promotionPiece: PieceSymbol) => {
    if (!pendingPromotion) return;
    const promotionContext = pendingPromotion;
    setPendingPromotion(null);

    if (promotionContext.mode === "premove") {
      queuePremove({
        sourceSquare: promotionContext.sourceSquare,
        targetSquare: promotionContext.targetSquare,
        pieceType: `${promotionContext.pieceColor}P`,
        promotion: promotionPiece,
      });
      return;
    }

    const success = handleUserMove(
      promotionContext.sourceSquare,
      promotionContext.targetSquare,
      promotionPiece
    );
    if (!success) {
      clearPremoves();
    }
  }, [pendingPromotion, queuePremove, handleUserMove, clearPremoves]
  );

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare, piece }: PieceDropHandlerArgs): boolean => {
      if (!targetSquare || sourceSquare === targetSquare || pendingPromotion) return false;
      const pieceColor = piece.pieceType[0] as "w" | "b";
      if (pieceColor !== userColor) return false;

      if (!isUserTurn || isExecutingPremoveRef.current) {
        if (isPromotionTarget(piece.pieceType, targetSquare)) {
          setPendingPromotion({
            sourceSquare,
            targetSquare,
            pieceColor,
            mode: "premove",
          });
        } else {
          queuePremove({
            sourceSquare,
            targetSquare,
            pieceType: piece.pieceType,
          });
        }
        return true;
      }

      return handleUserMove(sourceSquare, targetSquare);
    },
    [pendingPromotion, userColor, isUserTurn, isPromotionTarget, queuePremove, handleUserMove]
  );

  const handleSquareRightClick = useCallback(() => {
    clearPremoves();
    if (pendingPromotion?.mode === "premove") {
      setPendingPromotion(null);
    }
  }, [clearPremoves, pendingPromotion]
  );

  const canDragPiece = useCallback(
    ({ piece }: PieceHandlerArgs) => {
      return piece.pieceType[0] === userColor;
    },
    [userColor]
  );

  const handleSquareClick = useCallback(
    ({ square }: SquareHandlerArgs) => {
      if (!isUserTurn || feedback === "wrong" || feedback === "solved" || pendingPromotion) return;

      if (!selectedSquare) {
        selectSquareForMove(square);
        return;
      }

      if (square === selectedSquare) {
        clearSelection();
        return;
      }

      if (clickMoveTargets.includes(square)) {
        handleUserMove(selectedSquare, square);
        return;
      }

      selectSquareForMove(square);
    },
    [isUserTurn, feedback, pendingPromotion, selectedSquare, clickMoveTargets, clearSelection, selectSquareForMove, handleUserMove]
  );

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
        <div className="w-full aspect-square relative">
          {pendingPromotion && (
            <div
              className="absolute inset-0 z-10 bg-black/35 flex items-center justify-center"
              onClick={() => setPendingPromotion(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setPendingPromotion(null);
              }}
            >
              <div
                className="bg-zinc-900 border border-white/10 rounded-xl p-2 flex items-center gap-1.5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {(["q", "r", "n", "b"] as PieceSymbol[]).map((piece) => (
                  <button
                    key={piece}
                    type="button"
                    className="w-16 h-16 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center"
                    onClick={() => onPromotionPieceSelect(piece)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {defaultPieces[
                      `${pendingPromotion.pieceColor}${piece.toUpperCase()}` as keyof PieceRenderObject
                    ]()}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Chessboard
            options={{
              position,
              boardOrientation,
              canDragPiece,
              onPieceDrop: handlePieceDrop,
              onSquareClick: handleSquareClick,
              onSquareRightClick: handleSquareRightClick,
              showAnimations: true,
              allowDragging: feedback !== "solved" && !pendingPromotion,
              squareStyles,
              darkSquareStyle: { backgroundColor: LICHESS_DARK_SQUARE },
              lightSquareStyle: { backgroundColor: LICHESS_LIGHT_SQUARE },
              boardStyle: { width: "100%", height: "100%", aspectRatio: "1 / 1" },
              draggingPieceGhostStyle: { filter: "drop-shadow(0 0 5px rgba(255,255,255,0.7))" },
            }}
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

      try {
        const { data } = await axios.get(`http://localhost:3030/woodpeaker/item/${sessionId}`, { withCredentials: true });
        const normalized = Array.isArray(data?.data)
          ? (data.data as unknown[]).map(normalizePuzzle)
          : [];

        setPuzzles(normalized);
        setCurrentPuzzleIndex(0);
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
      await axios.post("http://localhost:3030/woodpeaker/buckt", bucket, { withCredentials: true });
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

    setCurrentPuzzleIndex(nextIndex);
  }, [puzzles, currentPuzzleIndex, pushTimestampBucket, sendBucketToBackend]);

  const handleFailed = useCallback(() => {
    setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
  }, []);

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= puzzles.length) return;
    if (idx > currentPuzzleIndex) {
      pushTimestampBucket(clockElapsedRef.current);
    }
    setCurrentPuzzleIndex(idx);
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
              <PuzzleBoard
                key={`${currentPuzzle._id}-${currentPuzzleIndex}`}
                puzzle={currentPuzzle}
                onSolved={handleSolved}
                onFailed={handleFailed}
                onUserMoveStart={ensureSessionStarted}
              />
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
