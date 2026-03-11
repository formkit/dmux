import { EventEmitter } from 'events';
import type { AgentStatus } from '../types.js';
import {
  getStatusDetector,
  type AttentionNeededEvent,
  type PaneUserInteractionEvent,
  type StatusUpdateEvent,
} from './StatusDetector.js';
import {
  DmuxFocusService,
  type DmuxFocusChangedEvent,
} from './DmuxFocusService.js';
import { LogService } from './LogService.js';
import { supportsNativeDmuxHelper } from '../utils/focusDetection.js';

interface AttentionCandidate {
  paneId: string;
  tmuxPaneId: string;
  status: Extract<AgentStatus, 'idle' | 'waiting'>;
  title: string;
  body: string;
  subtitle?: string;
  fingerprint: string;
}

interface DmuxAttentionServiceOptions {
  focusService: DmuxFocusService;
}

export interface PaneAttentionChangedEvent {
  paneId: string;
  tmuxPaneId: string;
  needsAttention: boolean;
}

export class DmuxAttentionService extends EventEmitter {
  private readonly logger = LogService.getInstance();
  private readonly statusDetector = getStatusDetector();
  private readonly candidates = new Map<string, AttentionCandidate>();
  private readonly notifiedFingerprints = new Map<string, string>();
  private readonly baselineFingerprints = new Map<string, string>();
  private readonly armedPanes = new Set<string>();
  private readonly activeAttentionPanes = new Map<string, string>();
  private active = false;

  constructor(private readonly options: DmuxAttentionServiceOptions) {
    super();
  }

  start(): void {
    if (this.active || !supportsNativeDmuxHelper()) {
      return;
    }

    this.active = true;
    this.statusDetector.on('status-updated', this.handleStatusUpdate);
    this.statusDetector.on('attention-needed', this.handleAttentionNeeded);
    this.statusDetector.on('pane-user-interaction', this.handleUserInteraction);
    this.options.focusService.on('focus-changed', this.handleFocusChanged);
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.statusDetector.off('status-updated', this.handleStatusUpdate);
    this.statusDetector.off('attention-needed', this.handleAttentionNeeded);
    this.statusDetector.off('pane-user-interaction', this.handleUserInteraction);
    this.options.focusService.off('focus-changed', this.handleFocusChanged);
    for (const [paneId, tmuxPaneId] of this.activeAttentionPanes) {
      this.options.focusService.setPaneAttentionIndicator(tmuxPaneId, false);
      this.emit('attention-changed', {
        paneId,
        tmuxPaneId,
        needsAttention: false,
      } satisfies PaneAttentionChangedEvent);
    }
    this.candidates.clear();
    this.notifiedFingerprints.clear();
    this.baselineFingerprints.clear();
    this.armedPanes.clear();
    this.activeAttentionPanes.clear();
  }

  private readonly handleStatusUpdate = (event: StatusUpdateEvent): void => {
    if (event.status === 'working') {
      this.resetPaneAttention(event.paneId);
      this.armedPanes.add(event.paneId);
      return;
    }

    if (event.status === 'analyzing') {
      this.candidates.delete(event.paneId);
      return;
    }
  };

  private readonly handleUserInteraction = (event: PaneUserInteractionEvent): void => {
    this.resetPaneAttention(event.paneId);
  };

  private readonly handleAttentionNeeded = (event: AttentionNeededEvent): void => {
    this.candidates.set(event.paneId, {
      paneId: event.paneId,
      tmuxPaneId: event.tmuxPaneId,
      status: event.status,
      title: event.title,
      body: event.body,
      subtitle: event.subtitle,
      fingerprint: event.fingerprint,
    });

    void this.maybeNotify(event.paneId);
  };

  private readonly handleFocusChanged = (_event: DmuxFocusChangedEvent): void => {
    for (const paneId of this.candidates.keys()) {
      void this.maybeNotify(paneId);
    }
  };

  private async maybeNotify(paneId: string): Promise<void> {
    if (!this.active) {
      return;
    }

    const candidate = this.candidates.get(paneId);
    if (!candidate) {
      return;
    }

    if (!this.armedPanes.has(paneId)) {
      const baselineFingerprint = this.baselineFingerprints.get(paneId);
      if (!baselineFingerprint) {
        this.baselineFingerprints.set(paneId, candidate.fingerprint);
        this.logger.debug(
          `Suppressing startup attention notification for ${paneId} until activity is observed`,
          'attentionService',
          paneId
        );
        return;
      }

      if (baselineFingerprint === candidate.fingerprint) {
        return;
      }

      this.baselineFingerprints.delete(paneId);
      this.armedPanes.add(paneId);
    }

    const attentionSurface = await this.options.focusService.getPaneAttentionSurface(candidate.tmuxPaneId);
    if (attentionSurface === 'fully-focused') {
      return;
    }

    const activeAttentionPaneId = this.activeAttentionPanes.get(paneId);
    if (activeAttentionPaneId) {
      if (activeAttentionPaneId !== candidate.tmuxPaneId) {
        this.setPaneAttention(paneId, candidate.tmuxPaneId, true);
      }

      this.baselineFingerprints.delete(paneId);
      this.notifiedFingerprints.set(paneId, candidate.fingerprint);
      return;
    }

    if (this.notifiedFingerprints.get(paneId) === candidate.fingerprint) {
      return;
    }

    if (attentionSurface === 'same-window') {
      await this.options.focusService.flashPaneAttention(candidate.tmuxPaneId);
      this.setPaneAttention(paneId, candidate.tmuxPaneId, true);
      this.baselineFingerprints.delete(paneId);
      this.notifiedFingerprints.set(paneId, candidate.fingerprint);
      return;
    }

    const sent = await this.options.focusService.sendAttentionNotification({
      title: candidate.title,
      subtitle: candidate.subtitle,
      body: candidate.body,
      tmuxPaneId: candidate.tmuxPaneId,
    });

    if (!sent) {
      this.logger.debug(
        `Attention notification skipped for ${paneId} because the helper notification send failed`,
        'attentionService',
        paneId
      );
      return;
    }

    this.setPaneAttention(paneId, candidate.tmuxPaneId, true);
    this.baselineFingerprints.delete(paneId);
    this.notifiedFingerprints.set(paneId, candidate.fingerprint);
  }

  private resetPaneAttention(paneId: string): void {
    this.setPaneAttention(paneId, undefined, false);
    this.candidates.delete(paneId);
    this.notifiedFingerprints.delete(paneId);
    this.baselineFingerprints.delete(paneId);
    this.armedPanes.delete(paneId);
  }

  private setPaneAttention(
    paneId: string,
    tmuxPaneId: string | undefined,
    needsAttention: boolean
  ): void {
    const currentTmuxPaneId = this.activeAttentionPanes.get(paneId);

    if (needsAttention) {
      if (!tmuxPaneId) {
        return;
      }

      if (currentTmuxPaneId === tmuxPaneId) {
        return;
      }

      if (currentTmuxPaneId && currentTmuxPaneId !== tmuxPaneId) {
        this.options.focusService.setPaneAttentionIndicator(currentTmuxPaneId, false);
      }

      this.activeAttentionPanes.set(paneId, tmuxPaneId);
      this.options.focusService.setPaneAttentionIndicator(tmuxPaneId, true);
      this.emit('attention-changed', {
        paneId,
        tmuxPaneId,
        needsAttention: true,
      } satisfies PaneAttentionChangedEvent);
      return;
    }

    if (!currentTmuxPaneId) {
      return;
    }

    this.activeAttentionPanes.delete(paneId);
    this.options.focusService.setPaneAttentionIndicator(currentTmuxPaneId, false);
    this.emit('attention-changed', {
      paneId,
      tmuxPaneId: currentTmuxPaneId,
      needsAttention: false,
    } satisfies PaneAttentionChangedEvent);
  }
}
