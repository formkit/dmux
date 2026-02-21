import { LogService } from '../services/LogService.js';
import { runTmuxConfigOnboardingIfNeeded } from './tmuxConfigOnboarding.js';

/**
 * Run all first-run onboarding checks in one place.
 * This currently includes:
 * - tmux config suggestion/setup
 */
export async function runFirstRunOnboardingIfNeeded(): Promise<void> {
  await runTmuxConfigOnboardingIfNeeded();
}
