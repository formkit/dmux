import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import useNavigation from '../src/hooks/useNavigation.js';

type FindCardInDirection = (
  currentIndex: number,
  direction: 'up' | 'down' | 'left' | 'right'
) => number | null;

function Harness({
  navigationRows,
  groupStartRows,
  onReady,
}: {
  navigationRows: number[][];
  groupStartRows?: number[];
  onReady: (findCardInDirection: FindCardInDirection) => void;
}) {
  const { findCardInDirection } = useNavigation(navigationRows, groupStartRows);
  onReady(findCardInDirection);

  return <Text>navigation</Text>;
}

describe('useNavigation', () => {
  it('moves sequentially across action rows before jumping between project groups', () => {
    let findCardInDirection!: FindCardInDirection;

    const { unmount } = render(
      <Harness
        navigationRows={[
          [0],
          [1, 2, 3],
          [4],
          [5, 6, 7],
        ]}
        groupStartRows={[0, 2]}
        onReady={(fn) => {
          findCardInDirection = fn;
        }}
      />
    );

    expect(findCardInDirection(1, 'right')).toBe(2);
    expect(findCardInDirection(2, 'right')).toBe(3);
    expect(findCardInDirection(3, 'left')).toBe(2);
    expect(findCardInDirection(2, 'left')).toBe(1);

    // End-of-row navigation still falls back to project jumps.
    expect(findCardInDirection(3, 'right')).toBe(4);
    expect(findCardInDirection(5, 'left')).toBe(0);

    unmount();
  });

  it('keeps pane-row left/right navigation as project-to-project jumps', () => {
    let findCardInDirection!: FindCardInDirection;

    const { unmount } = render(
      <Harness
        navigationRows={[
          [0],
          [1, 2],
          [3],
          [4, 5],
        ]}
        groupStartRows={[0, 2]}
        onReady={(fn) => {
          findCardInDirection = fn;
        }}
      />
    );

    expect(findCardInDirection(0, 'right')).toBe(3);
    expect(findCardInDirection(3, 'left')).toBe(0);

    unmount();
  });
});
