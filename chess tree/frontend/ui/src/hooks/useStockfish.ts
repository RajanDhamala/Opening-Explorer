import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Engine from '../engine';

export interface StockfishEvaluation {
  positionEvaluation: number;
  possibleMate: string;
  bestLine: string;
  bestMove: string;
  depth: number;
}

export function useStockfish(fen: string, turn: 'w' | 'b', isGameOver: boolean) {
  const engine = useMemo(() => new Engine(), []);
  const [evaluation, setEvaluation] = useState<StockfishEvaluation>({
    positionEvaluation: 0,
    possibleMate: '',
    bestLine: '',
    bestMove: '',
    depth: 0,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const prevFenRef = useRef<string>('');
  const turnRef = useRef<'w' | 'b'>(turn);

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  useEffect(() => {
    console.log('[useStockfish] Setting up message handler');

    engine.onMessage(({ positionEvaluation, possibleMate, pv, depth, bestMove }) => {
      console.log('[useStockfish] Received:', { positionEvaluation, possibleMate, depth, bestMove, pv: pv?.substring(0, 30) });

      if (depth && depth < 10) return;

      if (positionEvaluation) {
        const evalScore = (turnRef.current === 'w' ? 1 : -1) * Number(positionEvaluation) / 100;
        console.log('[useStockfish] Setting eval:', evalScore);
        setEvaluation((prev) => ({ ...prev, positionEvaluation: evalScore }));
      }

      if (possibleMate) {
        console.log('[useStockfish] Mate found:', possibleMate);
        setEvaluation((prev) => ({ ...prev, possibleMate }));
      }

      if (depth) {
        setEvaluation((prev) => ({ ...prev, depth }));
      }

      if (pv) {
        const firstMove = pv.split(' ')[0] || '';
        console.log('[useStockfish] Best move:', firstMove);
        setEvaluation((prev) => ({
          ...prev,
          bestLine: pv,
          bestMove: firstMove,
        }));
      }

      if (bestMove) {
        console.log('[useStockfish] Analysis complete');
        setIsAnalyzing(false);
      }
    });

    return () => {
      engine.terminate();
    };
  }, [engine]);

  useEffect(() => {
    console.log('[useStockfish] FEN changed:', fen, 'isGameOver:', isGameOver);

    if (isGameOver) {
      console.log('[useStockfish] Game over, skipping');
      return;
    }

    if (fen === prevFenRef.current) {
      console.log('[useStockfish] Same FEN, skipping');
      return;
    }

    prevFenRef.current = fen;

    setEvaluation({
      positionEvaluation: 0,
      possibleMate: '',
      bestLine: '',
      bestMove: '',
      depth: 0,
    });
    setIsAnalyzing(true);

    engine.stop();
    engine.evaluatePosition(fen, 18);

    return () => {
      engine.stop();
    };
  }, [fen, isGameOver, engine]);

  const stopAnalysis = useCallback(() => {
    engine.stop();
    setIsAnalyzing(false);
  }, [engine]);

  const resetEvaluation = useCallback(() => {
    setEvaluation({
      positionEvaluation: 0,
      possibleMate: '',
      bestLine: '',
      bestMove: '',
      depth: 0,
    });
  }, []);

  return { evaluation, isAnalyzing, stopAnalysis, resetEvaluation };
}
