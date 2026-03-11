import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DmuxAttentionService } from '../src/services/DmuxAttentionService.js';
import { getStatusDetector, resetStatusDetector } from '../src/services/StatusDetector.js';

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

class MockFocusService extends EventEmitter {
  isPaneFullyFocused = vi.fn(() => false);
  getPaneAttentionSurface = vi.fn(async () => 'background');
  flashPaneAttention = vi.fn(async () => undefined);
  setPaneAttentionIndicator = vi.fn(() => undefined);
  sendAttentionNotification = vi.fn(async () => true);
}

function emitStatusUpdated(event: {
  paneId: string;
  status: 'idle' | 'analyzing' | 'waiting' | 'working';
}): void {
  getStatusDetector().emit('status-updated', event);
}

function emitAttentionNeeded(event: {
  paneId: string;
  tmuxPaneId: string;
  status: 'idle' | 'waiting';
  title: string;
  body: string;
  subtitle?: string;
  fingerprint: string;
}): void {
  getStatusDetector().emit('attention-needed', event);
}

function emitPaneUserInteraction(event: { paneId: string }): void {
  getStatusDetector().emit('pane-user-interaction', event);
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

describe('DmuxAttentionService', () => {
  beforeEach(() => {
    setPlatform('darwin');
  });

  afterEach(() => {
    resetStatusDetector();
    setPlatform(originalPlatform);
    vi.restoreAllMocks();
  });

  it('suppresses startup attention notifications until pane activity is observed', async () => {
    const focusService = new MockFocusService();
    const service = new DmuxAttentionService({ focusService: focusService as any });

    service.start();

    emitAttentionNeeded({
      paneId: 'pane-1',
      tmuxPaneId: '%1',
      status: 'idle',
      title: 'Ready for the next prompt',
      body: 'The agent finished its current step. Open the pane and continue the work.',
      fingerprint: 'idle:ready',
    });
    await flushAsyncWork();

    expect(focusService.sendAttentionNotification).not.toHaveBeenCalled();

    focusService.emit('focus-changed', {
      fullyFocusedPaneId: null,
      helperFocused: false,
    });
    await flushAsyncWork();

    expect(focusService.sendAttentionNotification).not.toHaveBeenCalled();

    service.stop();
  });

  it('notifies once a pane returns to attention after working', async () => {
    const focusService = new MockFocusService();
    const service = new DmuxAttentionService({ focusService: focusService as any });

    service.start();

    emitAttentionNeeded({
      paneId: 'pane-1',
      tmuxPaneId: '%1',
      status: 'idle',
      title: 'Ready for the next prompt',
      body: 'The agent finished its current step. Open the pane and continue the work.',
      fingerprint: 'idle:ready',
    });
    await flushAsyncWork();

    emitStatusUpdated({
      paneId: 'pane-1',
      status: 'working',
    });

    emitAttentionNeeded({
      paneId: 'pane-1',
      tmuxPaneId: '%1',
      status: 'idle',
      title: 'Ready for the next prompt',
      body: 'The agent finished its current step. Open the pane and continue the work.',
      fingerprint: 'idle:ready',
    });
    await flushAsyncWork();

    expect(focusService.sendAttentionNotification).toHaveBeenCalledTimes(1);
    expect(focusService.sendAttentionNotification).toHaveBeenCalledWith({
      title: 'Ready for the next prompt',
      subtitle: undefined,
      body: 'The agent finished its current step. Open the pane and continue the work.',
      tmuxPaneId: '%1',
    });

    service.stop();
  });

  it('flashes the pane instead of sending a native notification when the terminal window is focused', async () => {
    const focusService = new MockFocusService();
    focusService.getPaneAttentionSurface.mockResolvedValue('same-window');
    const service = new DmuxAttentionService({ focusService: focusService as any });

    service.start();

    emitStatusUpdated({
      paneId: 'pane-2',
      status: 'working',
    });

    emitAttentionNeeded({
      paneId: 'pane-2',
      tmuxPaneId: '%9',
      status: 'idle',
      title: 'Review result',
      body: 'The pane settled and is waiting for your next step.',
      fingerprint: 'idle:review-result',
    });
    await flushAsyncWork();

    expect(focusService.flashPaneAttention).toHaveBeenCalledTimes(1);
    expect(focusService.flashPaneAttention).toHaveBeenCalledWith('%9');
    expect(focusService.setPaneAttentionIndicator).toHaveBeenCalledWith('%9', true);
    expect(focusService.sendAttentionNotification).not.toHaveBeenCalled();

    service.stop();
  });

  it('does not send a native notification when the tmux pane is already fully focused', async () => {
    const focusService = new MockFocusService();
    focusService.getPaneAttentionSurface.mockResolvedValue('fully-focused');
    const service = new DmuxAttentionService({ focusService: focusService as any });

    service.start();

    emitStatusUpdated({
      paneId: 'dmux-pane-7',
      status: 'working',
    });

    emitAttentionNeeded({
      paneId: 'dmux-pane-7',
      tmuxPaneId: '%12',
      status: 'idle',
      title: 'Stay here',
      body: 'This pane is already focused.',
      fingerprint: 'idle:stay-here',
    });
    await flushAsyncWork();

    expect(focusService.getPaneAttentionSurface).toHaveBeenCalledWith('%12');
    expect(focusService.flashPaneAttention).not.toHaveBeenCalled();
    expect(focusService.sendAttentionNotification).not.toHaveBeenCalled();

    service.stop();
  });

  it('still sends a native notification when the pane is selected but the terminal window is in the background', async () => {
    const focusService = new MockFocusService();
    focusService.getPaneAttentionSurface.mockResolvedValue('background');
    const service = new DmuxAttentionService({ focusService: focusService as any });

    service.start();

    emitStatusUpdated({
      paneId: 'pane-foreground-in-tmux',
      status: 'working',
    });

    emitAttentionNeeded({
      paneId: 'pane-foreground-in-tmux',
      tmuxPaneId: '%21',
      status: 'idle',
      title: 'Background terminal',
      body: 'The pane finished work while the terminal window was not active.',
      fingerprint: 'idle:background-terminal',
    });
    await flushAsyncWork();

    expect(focusService.getPaneAttentionSurface).toHaveBeenCalledWith('%21');
    expect(focusService.flashPaneAttention).not.toHaveBeenCalled();
    expect(focusService.sendAttentionNotification).toHaveBeenCalledTimes(1);
    expect(focusService.sendAttentionNotification).toHaveBeenCalledWith({
      title: 'Background terminal',
      subtitle: undefined,
      body: 'The pane finished work while the terminal window was not active.',
      tmuxPaneId: '%21',
    });

    service.stop();
  });

  it('clears pending attention when the user interacts with the pane', async () => {
    const focusService = new MockFocusService();
    const service = new DmuxAttentionService({ focusService: focusService as any });

    service.start();

    emitStatusUpdated({
      paneId: 'pane-3',
      status: 'working',
    });

    emitAttentionNeeded({
      paneId: 'pane-3',
      tmuxPaneId: '%5',
      status: 'idle',
      title: 'Ready',
      body: 'Continue the work.',
      fingerprint: 'idle:ready',
    });
    await flushAsyncWork();

    expect(focusService.sendAttentionNotification).toHaveBeenCalledTimes(1);
    expect(focusService.setPaneAttentionIndicator).toHaveBeenCalledWith('%5', true);

    emitPaneUserInteraction({ paneId: 'pane-3' });
    focusService.sendAttentionNotification.mockClear();

    focusService.emit('focus-changed', {
      fullyFocusedPaneId: null,
      helperFocused: false,
    });
    await flushAsyncWork();

    expect(focusService.sendAttentionNotification).not.toHaveBeenCalled();
    expect(focusService.setPaneAttentionIndicator).toHaveBeenCalledWith('%5', false);

    service.stop();
  });

  it('does not notify again while an existing attention alert is still active', async () => {
    const focusService = new MockFocusService();
    const service = new DmuxAttentionService({ focusService: focusService as any });

    service.start();

    emitStatusUpdated({
      paneId: 'pane-4',
      status: 'working',
    });

    emitAttentionNeeded({
      paneId: 'pane-4',
      tmuxPaneId: '%6',
      status: 'idle',
      title: 'Review pass one',
      body: 'The agent stopped after the first pass.',
      fingerprint: 'idle:review-pass-one',
    });
    await flushAsyncWork();

    emitAttentionNeeded({
      paneId: 'pane-4',
      tmuxPaneId: '%6',
      status: 'idle',
      title: 'Review pass two',
      body: 'The agent is still waiting for you.',
      fingerprint: 'idle:review-pass-two',
    });
    await flushAsyncWork();

    expect(focusService.sendAttentionNotification).toHaveBeenCalledTimes(1);
    expect(focusService.setPaneAttentionIndicator).toHaveBeenCalledWith('%6', true);

    service.stop();
  });
});
