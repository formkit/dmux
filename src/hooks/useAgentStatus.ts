import { useEffect, useState, useRef } from 'react';
import type { DmuxPane, AgentStatus } from '../types.js';
import { getStatusDetector } from '../services/StatusDetector.js';
import { LogService } from '../services/LogService.js';

interface UseAgentStatusParams {
  panes: DmuxPane[];
  suspend: boolean; // true when dialogs are open to avoid UI freezing
  onPaneRemoved?: (paneId: string) => void; // callback when a pane no longer exists
}

// Return type: map of pane ID to status
export type AgentStatusMap = Map<string, AgentStatus | undefined>;

export default function useAgentStatus({ panes, suspend, onPaneRemoved }: UseAgentStatusParams): AgentStatusMap {
  const [statuses, setStatuses] = useState<AgentStatusMap>(new Map());
  const statusDetector = useRef(getStatusDetector());
  const panesRef = useRef(panes);
  const onPaneRemovedRef = useRef(onPaneRemoved);
  const lastMonitorSignature = useRef('');

  // Keep refs up to date
  panesRef.current = panes;
  onPaneRemovedRef.current = onPaneRemoved;

  useEffect(() => {
    const detector = statusDetector.current;

    // Subscribe to status updates from the detector
    const handleStatusUpdate = (event: any) => {
      setStatuses(prevStatuses => {
        const existing = prevStatuses.get(event.paneId);
        if (existing === event.status) {
          return prevStatuses;
        }
        const newStatuses = new Map(prevStatuses);
        newStatuses.set(event.paneId, event.status);
        return newStatuses;
      });
    };

    // Handle pane removal events
    const handlePaneRemoved = (event: any) => {
      // Remove from statuses
      setStatuses(prevStatuses => {
        const newStatuses = new Map(prevStatuses);
        newStatuses.delete(event.paneId);
        return newStatuses;
      });

      // Call callback if provided
      if (onPaneRemovedRef.current) {
        onPaneRemovedRef.current(event.paneId);
      }
    };

    // Listen for status updates
    detector.on('status-updated', handleStatusUpdate);
    detector.on('pane-removed', handlePaneRemoved);

    // Initial load of current statuses
    const currentStatuses = detector.getAllStatuses();
    setStatuses(currentStatuses);

    return () => {
      detector.off('status-updated', handleStatusUpdate);
      detector.off('pane-removed', handlePaneRemoved);
    };
  }, []);

  useEffect(() => {
    const detector = statusDetector.current;
    const paneSignature = panes.map((pane) => pane.id).join(',');

    if (suspend || panes.length === 0) {
      lastMonitorSignature.current = '';
      return;
    }

    if (lastMonitorSignature.current === paneSignature) {
      return;
    }
    lastMonitorSignature.current = paneSignature;

    // Update monitoring when panes change or suspend state changes
    detector.monitorPanes(panes).catch(err => {
      LogService.getInstance().debug(
        `Failed to monitor panes: ${err instanceof Error ? err.message : String(err)}`,
        'useAgentStatus'
      );
    });
  }, [panes, suspend]);

  return statuses;
}
