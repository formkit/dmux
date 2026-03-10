interface DmuxProcessShutdownState {
  claimed: boolean;
  owner?: string;
}

type GlobalWithDmuxShutdownState = typeof globalThis & {
  __dmuxProcessShutdownState?: DmuxProcessShutdownState;
};

function getShutdownState(): DmuxProcessShutdownState {
  const globalWithState = globalThis as GlobalWithDmuxShutdownState;
  if (!globalWithState.__dmuxProcessShutdownState) {
    globalWithState.__dmuxProcessShutdownState = {
      claimed: false,
    };
  }

  return globalWithState.__dmuxProcessShutdownState;
}

export function claimProcessShutdown(owner: string): boolean {
  const state = getShutdownState();
  if (state.claimed) {
    return false;
  }

  state.claimed = true;
  state.owner = owner;
  return true;
}

export function getClaimedProcessShutdownOwner(): string | undefined {
  return getShutdownState().owner;
}

export function resetProcessShutdownForTesting(): void {
  const state = getShutdownState();
  state.claimed = false;
  state.owner = undefined;
}
