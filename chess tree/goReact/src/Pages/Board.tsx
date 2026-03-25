import { useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";

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


  interface Player {
    name: string,
    age: Number,
    email: string
  }
  // Example player for demonstration
  void ({ name: "John Doe", age: 30, email: "demo@gmail.com" } as Player);

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

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,560px)_1fr]">
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

          <aside className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Moves</h2>
            {moveHistory.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-400">No moves yet.</p>
            ) : (
              <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-neutral-200 sm:grid-cols-3">
                {moveHistory.map((move, index) => (
                  <li key={`${move}-${index}`} className="rounded-md bg-neutral-950 px-2 py-1">
                    {index + 1}. {move}
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default BoardPage;
