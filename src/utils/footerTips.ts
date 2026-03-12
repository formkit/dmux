// Keep these short enough to fit on a single footer line in the sidebar.
const BASE_FOOTER_TIPS = [
  'Press [?] for every shortcut.',
  'Press [m] for pane actions.',
  'Press [s] to tweak dmux settings.',
  'You can hide tips in settings.',
  'Press [l] to inspect dmux logs.',
  'Press [n] for a new agent pane.',
  'Press [t] for a new terminal.',
  'On a pane, [a] adds an agent.',
  'On a pane, [A] adds a terminal.',
  'Press [b] for a child worktree.',
  'Press [f] for the file browser.',
  'Press [r] to reopen a worktree.',
  'Hidden panes keep running.',
  'Default agent skips the chooser.',
  'Autopilot can accept safe choices.',
  'Set a base branch for worktrees.',
  'Branch prefixes keep names tidy.',
  'Merge can offer AI conflict help.',
  'Merge can queue child worktrees.',
  'Close can clean up worktrees.',
  'Tmux hooks can lower idle CPU.',
  'Pick alert sounds in settings.',
  'Press [p] to add another project.',
  'Press [P] to focus one project.',
  'Press [H] to hide the others.',
  'Press M-M in a pane for its menu.',
  'One session can group projects.',
] as const;

const DEV_FOOTER_TIPS = [
  'DEV: press [S] to switch source.',
  'DEV: source can fall back to root.',
] as const;

export const FOOTER_TIP_ROTATION_INTERVAL = 15000;

export function getFooterTips(isDevMode: boolean): readonly string[] {
  return isDevMode
    ? [...BASE_FOOTER_TIPS, ...DEV_FOOTER_TIPS]
    : BASE_FOOTER_TIPS;
}

export function getNextFooterTipIndex(currentIndex: number, totalTips: number): number {
  if (totalTips <= 0) {
    return -1;
  }

  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= totalTips) {
    return 0;
  }

  return (currentIndex + 1) % totalTips;
}

export function getRandomFooterTipIndex(totalTips: number, randomValue: number = Math.random()): number {
  if (totalTips <= 0) {
    return -1;
  }

  const normalizedValue = Number.isFinite(randomValue) ? Math.abs(randomValue) % 1 : 0;
  return Math.min(totalTips - 1, Math.floor(normalizedValue * totalTips));
}
