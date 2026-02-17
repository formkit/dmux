import { useMemo } from 'react';

export default function useNavigation(terminalWidth: number, panesLength: number, isLoading: boolean) {
  const cardWidth = 35 + 2; // Card width + gap
  const cardsPerRow = Math.max(1, Math.floor(terminalWidth / cardWidth));
  const totalItems = panesLength + (isLoading ? 0 : 3); // Three actions: agent, terminal, projects

  const getCardGridPosition = useMemo(() => {
    return (index: number): { row: number; col: number } => {
      const row = Math.floor(index / cardsPerRow);
      const col = index % cardsPerRow;
      return { row, col };
    };
  }, [cardsPerRow]);

  const findCardInDirection = useMemo(() => {
    return (currentIndex: number, direction: 'up' | 'down' | 'left' | 'right'): number | null => {
      const currentPos = getCardGridPosition(currentIndex);
      let targetIndex: number | null = null;

      switch (direction) {
        case 'up':
          if (currentPos.row > 0) {
            targetIndex = (currentPos.row - 1) * cardsPerRow + currentPos.col;
            if (targetIndex >= totalItems) {
              targetIndex = Math.min((currentPos.row - 1) * cardsPerRow + cardsPerRow - 1, totalItems - 1);
            }
          }
          break;
        case 'down':
          targetIndex = (currentPos.row + 1) * cardsPerRow + currentPos.col;
          if (targetIndex >= totalItems) {
            if (currentIndex < totalItems - 1) targetIndex = totalItems - 1; else targetIndex = null;
          }
          break;
        case 'left':
          if (currentPos.col > 0) {
            targetIndex = currentIndex - 1;
          } else if (currentPos.row > 0) {
            targetIndex = currentPos.row * cardsPerRow - 1;
            if (targetIndex >= totalItems) targetIndex = totalItems - 1;
          }
          break;
        case 'right':
          if (currentPos.col < cardsPerRow - 1 && currentIndex < totalItems - 1) {
            targetIndex = currentIndex + 1;
          } else if ((currentPos.row + 1) * cardsPerRow < totalItems) {
            targetIndex = (currentPos.row + 1) * cardsPerRow;
          }
          break;
      }

      if (targetIndex !== null && targetIndex >= 0 && targetIndex < totalItems) {
        return targetIndex;
      }
      return null;
    };
  }, [cardsPerRow, totalItems, getCardGridPosition]);

  return { getCardGridPosition, findCardInDirection };
}
