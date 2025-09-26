import { useEffect, useState, useRef } from 'react';
import type { DmuxPane, AgentStatus } from '../types.js';
import { getStatusDetector } from '../services/StatusDetector.js';

interface UseAgentStatusParams {
  panes: DmuxPane[];
  suspend: boolean; // true when dialogs are open to avoid UI freezing
}

// Return type: map of pane ID to status
export type AgentStatusMap = Map<string, AgentStatus | undefined>;

export default function useAgentStatus({ panes, suspend }: UseAgentStatusParams): AgentStatusMap {
  const [statuses, setStatuses] = useState<AgentStatusMap>(new Map());
  const statusDetector = useRef(getStatusDetector());
  const panesRef = useRef(panes);

  // Keep refs up to date
  panesRef.current = panes;

  useEffect(() => {
    const detector = statusDetector.current;

    // Subscribe to status updates from the detector
    const handleStatusUpdate = (event: any) => {
      setStatuses(prevStatuses => {
        const newStatuses = new Map(prevStatuses);
        newStatuses.set(event.paneId, event.status);
        return newStatuses;
      });
    };

    // Listen for status updates
    detector.on('status-updated', handleStatusUpdate);

    // Initial load of current statuses
    const currentStatuses = detector.getAllStatuses();
    setStatuses(currentStatuses);

    return () => {
      detector.off('status-updated', handleStatusUpdate);
    };
  }, []);

  useEffect(() => {
    const detector = statusDetector.current;

    // Update monitoring when panes change or suspend state changes
    if (!suspend && panes.length > 0) {
      // Start monitoring these panes
      detector.monitorPanes(panes).catch(err => {
        console.error('Failed to monitor panes:', err);
      });
    }
  }, [panes, suspend]);

  return statuses;
}