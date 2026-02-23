import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useMutation, useQuery } from '@tanstack/react-query';

type PositionData = {
  Count: number;
  DrawCount: number;
  WinCount: number;
  LossCount: number;
  GamesId: string[] | null;
  ChildPositions: unknown[];
  Fen: string;
  ChildFens: { Fen: string; Move: string }[];
};

type GameMove = {
  San: string;
  Clock: string;
};

type BoardSide = 'white' | 'black';

type GameData = {
  Id: string;
  WhiteUsername: string;
  BlackUsername: string;
  WhiteRating: number;
  BlackRating: number;
  Result: string;
  ECO: string | null;
  Format: string;
  TimeControl: string;
  Termination: string;
  PlayedAt: string;
  Url: string;
  Pgn: GameMove[];
};

const API_BASE = import.meta.env.VITE_GO_API_URL || '/go';
const GAME_BY_ID_PATH = import.meta.env.VITE_GO_GAME_BY_ID_PATH || '/game';

async function getPositionData(fen: string): Promise<PositionData | null> {
  const response = await fetch(`${API_BASE}/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fen }),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`test request failed (${response.status})`);
  const json = await response.json();
  const payload = (json['data:'] ?? json.data) as PositionData | undefined;
  return payload ?? null;
}

async function syncPipelineGames(): Promise<void> {
  const response = await fetch(`${API_BASE}/png`);
  if (!response.ok) throw new Error(`sync failed (${response.status})`);
}

async function getGameById(gameId: string): Promise<GameData | null> {
  const response = await fetch(`${API_BASE}${GAME_BY_ID_PATH}/${encodeURIComponent(gameId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`game request failed (${response.status})`);
  const json = await response.json();
  return (json.data as GameData) ?? null;
}

export default function App() {
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [boardWidth, setBoardWidth] = useState(520);
  const [boardOrientation, setBoardOrientation] = useState<BoardSide>('white');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  useEffect(() => {
    const setResponsiveWidth = () => {
      const width = Math.max(280, Math.min(520, window.innerWidth - 40));
      setBoardWidth(width);
    };
    setResponsiveWidth();
    window.addEventListener('resize', setResponsiveWidth);
    return () => window.removeEventListener('resize', setResponsiveWidth);
  }, []);

  const game = useMemo(() => {
    const instance = new Chess();
    for (let i = 0; i < cursor; i += 1) {
      instance.move(moveHistory[i]);
    }
    return instance;
  }, [moveHistory, cursor]);

  const fen = game.fen();

  const positionQuery = useQuery({
    queryKey: ['position-test', fen],
    queryFn: () => getPositionData(fen),
  });

  const syncMutation = useMutation({
    mutationFn: syncPipelineGames,
    onSuccess: () => {
      setMoveHistory([]);
      setCursor(0);
    },
  });

  useEffect(() => {
    const firstGameId = positionQuery.data?.GamesId?.[0] ?? null;
    setSelectedGameId(firstGameId);
  }, [positionQuery.data]);

  const selectedGameQuery = useQuery({
    queryKey: ['game-by-id', selectedGameId],
    queryFn: () => getGameById(selectedGameId as string),
    enabled: !!selectedGameId,
  });

  const applyMove = (san: string) => {
    setMoveHistory((prev) => {
      const base = prev.slice(0, cursor);
      base.push(san);
      return base;
    });
    setCursor((prev) => prev + 1);
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    const copy = new Chess(fen);
    try {
      const move = copy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (!move) return false;
      applyMove(move.san);
      return true;
    } catch {
      return false;
    }
  };

  const resetBoard = () => {
    setMoveHistory([]);
    setCursor(0);
  };

  const canGoBack = cursor > 0;
  const canGoForward = cursor < moveHistory.length;
  const isLoading = positionQuery.isLoading || selectedGameQuery.isLoading;
  const errors = [
    positionQuery.error,
    selectedGameQuery.error,
    syncMutation.error,
  ].filter(Boolean);
  const errorText = errors[0] instanceof Error ? errors[0].message : null;
  const positionData = positionQuery.data ?? null;
  const childMoves = positionData?.ChildFens ?? [];
  const gameIds = positionData?.GamesId ?? [];
  const selectedGame = selectedGameQuery.data ?? null;

  return (
    <div className="app">
      <div className="page-head">
        <h1>Go Opening Explorer</h1>
        <p>Every board move updates FEN and fetches in-memory stats from backend /test.</p>
      </div>
      <div className="layout">
        <div className="card board-card">
          <Chessboard
            position={fen}
            onPieceDrop={onDrop}
            boardWidth={boardWidth}
            boardOrientation={boardOrientation}
          />
          <div className="controls">
            <button className="secondary" onClick={() => setCursor((prev) => Math.max(0, prev - 1))} disabled={!canGoBack}>
              ← Previous
            </button>
            <button className="secondary" onClick={() => setCursor((prev) => Math.min(moveHistory.length, prev + 1))} disabled={!canGoForward}>
              Next →
            </button>
            <button className="secondary" onClick={resetBoard}>Reset</button>
            <button className="secondary" onClick={() => setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}>
              Flip board
            </button>
            <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              {syncMutation.isPending ? 'Syncing…' : 'Sync games'}
            </button>
          </div>
          <div className="mono fen">FEN: {fen}</div>
          <div className="mono move-line">
            Line: {cursor === 0 ? '-' : moveHistory.slice(0, cursor).join(' ')}
          </div>
        </div>

        <div className="card">
          <h2>Current position stats (/test)</h2>
          {errorText && <p className="error">{errorText}</p>}
          {isLoading ? <p>Loading...</p> : null}
          <div className="stat-grid">
            <div className="stat">Count: {positionData?.Count ?? 0}</div>
            <div className="stat">Win: {positionData?.WinCount ?? 0}</div>
            <div className="stat">Loss: {positionData?.LossCount ?? 0}</div>
            <div className="stat">Draw: {positionData?.DrawCount ?? 0}</div>
            <div className="stat">FEN: {positionData?.Fen ?? fen}</div>
          </div>

          <h2>Child moves from backend</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Move</th>
                <th>Child FEN</th>
              </tr>
            </thead>
            <tbody>
              {childMoves.map((move) => (
                <tr key={`${move.Move}-${move.Fen}`}>
                  <td>
                    <button className="secondary" onClick={() => applyMove(move.Move)}>{move.Move}</button>
                  </td>
                  <td className="mono">{move.Fen}</td>
                </tr>
              ))}
              {childMoves.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={2}>No known continuations in memory for this FEN.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <h2>Games for this position</h2>
          <div className="filters">
            <select
              value={selectedGameId ?? ''}
              onChange={(e) => setSelectedGameId(e.target.value || null)}
            >
              {gameIds.length === 0 ? <option value="">No game IDs</option> : null}
              {gameIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
          <div className="games">
            {!selectedGameId ? <p>No game IDs returned for this position.</p> : null}
            {selectedGame ? (
              <div className="game-row">
                <div className="game-title">
                  {selectedGame.WhiteUsername} ({selectedGame.WhiteRating}) vs {selectedGame.BlackUsername} ({selectedGame.BlackRating})
                </div>
                <div className="game-meta">
                  <span>{selectedGame.Result}</span>
                  <span>{selectedGame.PlayedAt}</span>
                  <span>{selectedGame.ECO ?? '-'}</span>
                  {selectedGame.Url ? (
                    <a href={selectedGame.Url} target="_blank" rel="noreferrer">Game Link</a>
                  ) : null}
                </div>
                <div className="mono move-line">
                  PGN: {selectedGame.Pgn?.map((move) => move.San).join(' ') || '-'}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
