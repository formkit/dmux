import { useMemo } from 'react';

export default function useNavigation(navigationRows: number[][]) {
  const indexToPosition = useMemo(() => {
    const map = new Map<number, { row: number; col: number }>();
    navigationRows.forEach((rowItems, row) => {
      rowItems.forEach((itemIndex, col) => {
        map.set(itemIndex, { row, col });
      });
    });
    return map;
  }, [navigationRows]);

  const getCardGridPosition = useMemo(() => {
    return (index: number): { row: number; col: number } => {
      return indexToPosition.get(index) || { row: 0, col: 0 };
    };
  }, [indexToPosition]);

  const findCardInDirection = useMemo(() => {
    return (currentIndex: number, direction: 'up' | 'down' | 'left' | 'right'): number | null => {
      const currentPos = indexToPosition.get(currentIndex);
      if (!currentPos) return null;

      switch (direction) {
        case 'up':
          if (currentPos.row > 0 && navigationRows[currentPos.row - 1]) {
            const targetRow = navigationRows[currentPos.row - 1];
            const targetCol = Math.min(currentPos.col, targetRow.length - 1);
            return targetRow[targetCol] ?? null;
          }
          break;
        case 'down':
          if (currentPos.row < navigationRows.length - 1 && navigationRows[currentPos.row + 1]) {
            const targetRow = navigationRows[currentPos.row + 1];
            const targetCol = Math.min(currentPos.col, targetRow.length - 1);
            return targetRow[targetCol] ?? null;
          }
          break;
        case 'left':
          if (currentPos.col > 0) {
            const row = navigationRows[currentPos.row];
            return row?.[currentPos.col - 1] ?? null;
          }
          break;
        case 'right':
          if (navigationRows[currentPos.row] && currentPos.col < navigationRows[currentPos.row].length - 1) {
            const row = navigationRows[currentPos.row];
            return row?.[currentPos.col + 1] ?? null;
          }
          break;
      }

      return null;
    };
  }, [indexToPosition, navigationRows]);

  return { getCardGridPosition, findCardInDirection };
}
