import { afterEach, describe, expect, it } from 'vitest';
import {
  claimProcessShutdown,
  getClaimedProcessShutdownOwner,
  resetProcessShutdownForTesting,
} from '../src/utils/processShutdown.js';

describe('processShutdown', () => {
  afterEach(() => {
    resetProcessShutdownForTesting();
  });

  it('allows only the first shutdown claimant to proceed', () => {
    expect(claimProcessShutdown('app-clean-exit')).toBe(true);
    expect(getClaimedProcessShutdownOwner()).toBe('app-clean-exit');

    expect(claimProcessShutdown('signal-handler')).toBe(false);
    expect(getClaimedProcessShutdownOwner()).toBe('app-clean-exit');
  });

  it('can be reset between tests', () => {
    expect(claimProcessShutdown('signal-handler')).toBe(true);
    resetProcessShutdownForTesting();

    expect(claimProcessShutdown('app-clean-exit')).toBe(true);
    expect(getClaimedProcessShutdownOwner()).toBe('app-clean-exit');
  });
});
