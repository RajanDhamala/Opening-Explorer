import { useEffect } from 'react';
import { useChessStore } from '../stores/useChessStore';

export function useKeyboardNavigation() {
  const nextMove = useChessStore((state) => state.nextMove);
  const prevMove = useChessStore((state) => state.prevMove);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextMove();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevMove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextMove, prevMove]);
}
