import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface PositionStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface NextMove {
  move: string;
  fen: string;
  stats: PositionStats;
}

export interface GameInfo {
  opponentName: string;
  opponentRating: number;
  result: string;
  createdAt: string;
  chessComUrl: string;
}

interface PositionData {
  stats: PositionStats | null;
  nextMoves: NextMove[];
  recentGames: GameInfo[];
  timeClassStats?: {
    bullet: number;
    blitz: number;
    rapid: number;
    classical: number;
  };
}

export function usePositionData(fen: string, playerColor: string = 'white', timeClass?: string) {
  return useQuery<PositionData>({
    queryKey: ['position', fen, playerColor, timeClass],
    queryFn: async () => {
      const normalizedFen = fen.split(' ').slice(0, 4).join(' ');
      const isRoot = normalizedFen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
      
      console.log('🔍 usePositionData called:', { fen, normalizedFen, playerColor, timeClass, isRoot });
      
      const params = new URLSearchParams({
        playerColor,
        ...(timeClass && timeClass !== 'all' && { timeClass })
      });
      
      const endpoint = isRoot
        ? `${API_URL}/api/tree/root?${params}`
        : `${API_URL}/api/position?fen=${encodeURIComponent(normalizedFen)}&${params}`;

      console.log('📡 Fetching from:', endpoint);

      const { data } = await axios.get(endpoint);

      console.log('✅ Response:', data);

      if (isRoot) {
        return {
          stats: data.stats,
          nextMoves: data.nextMoves || [],
          recentGames: [],
          timeClassStats: data.timeClassStats,
        };
      }

      return {
        stats: data.position?.stats || null,
        nextMoves: data.nextMoves || [],
        recentGames: data.recentGames || [],
        timeClassStats: data.position?.timeClassStats,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
