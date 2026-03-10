import type { AgentStatus } from '../types.js';
import {
  getStatusDetector,
  type AttentionNeededEvent,
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

export class DmuxAttentionService {
  private readonly logger = LogService.getInstance();
  private readonly statusDetector = getStatusDetector();
  private readonly candidates = new Map<string, AttentionCandidate>();
  private readonly notifiedFingerprints = new Map<string, string>();
  private active = false;

  constructor(private readonly options: DmuxAttentionServiceOptions) {}

  start(): void {
    if (this.active || !supportsNativeDmuxHelper()) {
      return;
    }

    this.active = true;
    this.statusDetector.on('status-updated', this.handleStatusUpdate);
    this.statusDetector.on('attention-needed', this.handleAttentionNeeded);
    this.options.focusService.on('focus-changed', this.handleFocusChanged);
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.statusDetector.off('status-updated', this.handleStatusUpdate);
    this.statusDetector.off('attention-needed', this.handleAttentionNeeded);
    this.options.focusService.off('focus-changed', this.handleFocusChanged);
    this.candidates.clear();
    this.notifiedFingerprints.clear();
  }

  private readonly handleStatusUpdate = (event: StatusUpdateEvent): void => {
    if (event.status === 'working' || event.status === 'analyzing') {
      this.candidates.delete(event.paneId);
      this.notifiedFingerprints.delete(event.paneId);
    }
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

    if (this.options.focusService.isPaneFullyFocused(paneId)) {
      return;
    }

    if (this.notifiedFingerprints.get(paneId) === candidate.fingerprint) {
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

    this.notifiedFingerprints.set(paneId, candidate.fingerprint);
  }
}
