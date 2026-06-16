// Chess Tree Explorer - Complete Component
// Save this as: src/Pages/ChessTree.tsx

import { useState, useEffect } from 'react';
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard';
import axios from 'axios';

const API_URL = 'http://localhost:3000';

interface PositionStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
}

interface NextMove {
  move: string;
  fen: string;
  stats: PositionStats;
}

interface GameInfo {
  opponentName: string;
  opponentRating: number;
  result: string;
  createdAt: string;
  chessComUrl: string;
}

export default function ChessTree() {
  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [stats, setStats] = useState<PositionStats | null>(null);
  const [nextMoves, setNextMoves] = useState<NextMove[]>([]);
  const [recentGames, setRecentGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);

  // Load position data from API
  const loadPosition = async (positionFen: string) => {
    setLoading(true);
    setError(null);

    try {
      const normalizedFen = positionFen.split(' ').slice(0, 4).join(' ');
      const isRoot = normalizedFen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

      const endpoint = isRoot
        ? `${API_URL}/api/tree/root`
        : `${API_URL}/api/position/${encodeURIComponent(normalizedFen)}`;

      console.log('🔍 Loading position:', endpoint);
      const { data } = await axios.get(endpoint);

      if (isRoot) {
        setStats(data.stats);
        setNextMoves(data.nextMoves || []);
        setRecentGames([]);
      } else {
        setStats(data.position.stats);
        setNextMoves(data.nextMoves || []);
        setRecentGames(data.recentGames || []);
      }
    } catch (err: any) {
      console.error('❌ API Error:', err);
      setError(err.response?.data?.error || 'Failed to load position');
      setStats(null);
      setNextMoves([]);
      setRecentGames([]);
    } finally {
      setLoading(false);
    }
  };

  // Load position when FEN changes
  useEffect(() => {
    loadPosition(fen);
  }, [fen]);

  // Make a move

  const makeMove = (move: string) => {
    try {
      const result = chess.move(move);
      if (result) {
        const newFen = chess.fen();
        setFen(newFen);
        setMoveHistory([...moveHistory, move]);
        setCurrentMoveIndex(moveHistory.length + 1);
      }
    } catch (err) {

      console.log("invalid move aayo sathy")
      console.error('Invalid move:', err);
    }
  };


  // Go back one move
  const undoMove = () => {
    if (moveHistory.length === 0) return;
    chess.undo();
    const newFen = chess.fen();
    setFen(newFen);
    setMoveHistory(moveHistory.slice(0, -1));
    setCurrentMoveIndex(Math.max(0, currentMoveIndex - 1));
  };

  // Go forward one move (if we went back)
  const redoMove = () => {
    if (currentMoveIndex >= moveHistory.length) return;
    const move = moveHistory[currentMoveIndex];
    try {
      chess.move(move);
      const newFen = chess.fen();
      setFen(newFen);
      setCurrentMoveIndex(currentMoveIndex + 1);
    } catch (err) {
      console.error('Redo failed:', err);
    }
  };

  // Go to specific move in history
  const goToMove = (index: number) => {
    chess.reset();
    for (let i = 0; i < index; i++) {
      chess.move(moveHistory[i]);
    }
    setFen(chess.fen());
    setCurrentMoveIndex(index);
  };

  // Reset to start
  const resetBoard = () => {
    chess.reset();
    const newFen = chess.fen();
    setFen(newFen);
    setMoveHistory([]);
    setCurrentMoveIndex(0);
  };

  // Calculate percentages
  const getPercentage = (value: number, total: number) => {
    return total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
            Chess Opening Tree
          </h1>
          <p className="text-slate-400">Explore your opening repertoire</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Chessboard */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6">
              <div className="aspect-square max-w-2xl mx-auto">
                <Chessboard
                  position={fen}
                  boardOrientation="white"
                  customBoardStyle={{
                    borderRadius: '8px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  }}
                />
              </div>

              {/* Controls */}
              <div className="mt-4 flex gap-2 justify-center flex-wrap">
                <button
                  onClick={resetBoard}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition font-semibold"
                >
                  ⟲ Reset
                </button>

                <div className="flex gap-1 bg-slate-700 rounded-lg p-1">
                  <button
                    onClick={() => goToMove(0)}
                    disabled={currentMoveIndex === 0}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition"
                    title="Go to start"
                  >
                    ⟪
                  </button>
                  <button
                    onClick={undoMove}
                    disabled={currentMoveIndex === 0}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition"
                    title="Previous move"
                  >
                    ◀
                  </button>
                  <button
                    onClick={redoMove}
                    disabled={currentMoveIndex >= moveHistory.length}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition"
                    title="Next move"
                  >
                    ▶
                  </button>
                  <button
                    onClick={() => goToMove(moveHistory.length)}
                    disabled={currentMoveIndex >= moveHistory.length}
                    className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition"
                    title="Go to end"
                  >
                    ⟫
                  </button>
                </div>

                <div className="px-3 py-2 bg-slate-700 rounded-lg text-sm">
                  Move: {currentMoveIndex} / {moveHistory.length}
                </div>
              </div>

              {/* Move History */}
              {moveHistory.length > 0 && (
                <div className="mt-4 p-4 bg-slate-700 rounded-lg">
                  <h3 className="font-semibold mb-2">Move History</h3>
                  <div className="flex flex-wrap gap-2">
                    {moveHistory.map((move, idx) => (
                      <button
                        key={idx}
                        onClick={() => goToMove(idx + 1)}
                        className={`px-2 py-1 rounded text-sm transition ${idx + 1 === currentMoveIndex
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-600 hover:bg-slate-500'
                          }`}
                      >
                        {Math.floor(idx / 2) + 1}. {move}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Stats & Moves */}
          <div className="space-y-6">
            {/* Position Stats */}
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Position Statistics</h2>

              {loading && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                </div>
              )}

              {error && (
                <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-sm">
                  {error}
                </div>
              )}

              {stats && !loading && (
                <>
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Total Games:</span>
                      <span className="text-2xl font-bold">{stats.totalGames}</span>
                    </div>

                    {/* Win/Loss/Draw Bars */}
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-green-400">Wins</span>
                          <span>{stats.wins} ({getPercentage(stats.wins, stats.totalGames)}%)</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${getPercentage(stats.wins, stats.totalGames)}%` }}
                          ></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">Draws</span>
                          <span>{stats.draws} ({getPercentage(stats.draws, stats.totalGames)}%)</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-400"
                            style={{ width: `${getPercentage(stats.draws, stats.totalGames)}%` }}
                          ></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-red-400">Losses</span>
                          <span>{stats.losses} ({getPercentage(stats.losses, stats.totalGames)}%)</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500"
                            style={{ width: `${getPercentage(stats.losses, stats.totalGames)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Next Moves */}
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Available Moves</h2>

              {nextMoves.length === 0 && !loading && (
                <p className="text-slate-400 text-sm">No moves found in this position</p>
              )}

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {nextMoves.map((move, idx) => (
                  <button
                    key={idx}
                    onClick={() => makeMove(move.move)}
                    className="w-full text-left p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-lg group-hover:text-blue-400 transition">
                        {move.move}
                      </span>
                      <span className="text-sm text-slate-400">
                        {move.stats.totalGames} games
                      </span>
                    </div>
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-green-400">
                        W: {move.stats.wins}
                      </span>
                      <span className="text-slate-400">
                        D: {move.stats.draws}
                      </span>
                      <span className="text-red-400">
                        L: {move.stats.losses}
                      </span>
                      <span className="ml-auto text-blue-400">
                        {getPercentage(move.stats.wins, move.stats.totalGames)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Games */}
            {recentGames.length > 0 && (
              <div className="bg-slate-800 rounded-xl shadow-2xl p-6">
                <h2 className="text-xl font-bold mb-4">Recent Games</h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentGames.map((game, idx) => (
                    <a
                      key={idx}
                      href={game.chessComUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{game.opponentName}</span>
                        <span className={`text-sm px-2 py-1 rounded ${game.result === 'win' ? 'bg-green-900 text-green-300' :
                          game.result === 'loss' ? 'bg-red-900 text-red-300' :
                            'bg-slate-600 text-slate-300'
                          }`}>
                          {game.result.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        Rating: {game.opponentRating}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
