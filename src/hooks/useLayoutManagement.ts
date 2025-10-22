import { useEffect, useRef } from 'react';
import { enforceControlPaneSize } from '../utils/tmux.js';
import { SIDEBAR_WIDTH } from '../utils/layoutManager.js';
import { LogService } from '../services/LogService.js';

interface LayoutManagementOptions {
  controlPaneId: string | undefined;
  hasActiveDialog: boolean;
  onForceRepaint: () => void;
}

/**
 * Manages periodic enforcement of control pane (sidebar) size
 * Ensures the sidebar stays at SIDEBAR_WIDTH (40 chars) even after terminal resizes
 */
export function useLayoutManagement({
  controlPaneId,
  hasActiveDialog,
  onForceRepaint,
}: LayoutManagementOptions) {
  // Use refs to track state across resize events
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isApplyingLayoutRef = useRef(false);

  useEffect(() => {
    if (!controlPaneId) {
      return; // No sidebar layout configured
    }

    // Enforce sidebar width immediately on mount
    enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);

    const handleResize = () => {
      // Skip if we're already applying a layout (prevents loops)
      if (isApplyingLayoutRef.current) {
        return;
      }

      // Clear any pending resize
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Debounce: wait 500ms after last resize event (prevents excessive recalculations)
      resizeTimeoutRef.current = setTimeout(async () => {
        // Only enforce if not showing dialogs (to avoid interference)
        if (!hasActiveDialog) {
          isApplyingLayoutRef.current = true;

          LogService.getInstance().debug('Starting resize handler', 'ResizeDebug');

          // Only enforce sidebar width when terminal resizes
          await enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);

          LogService.getInstance().debug('enforceControlPaneSize complete, calling onForceRepaint', 'ResizeDebug');

          // CRITICAL: Force Ink to repaint AFTER layout changes complete
          // This ensures the dmux UI redraws last, preventing blank pane
          onForceRepaint();

          LogService.getInstance().debug('onForceRepaint called', 'ResizeDebug');

          // Reset flag after a brief delay
          setTimeout(() => {
            isApplyingLayoutRef.current = false;
          }, 100);
        }
      }, 500);
    };

    // Listen to stdout resize events
    process.stdout.on('resize', handleResize);

    // Also listen for SIGWINCH and SIGUSR1 (tmux hook sends USR1)
    process.on('SIGWINCH', handleResize);
    process.on('SIGUSR1', handleResize);

    return () => {
      process.stdout.off('resize', handleResize);
      process.off('SIGWINCH', handleResize);
      process.off('SIGUSR1', handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [controlPaneId, hasActiveDialog, onForceRepaint]);
}
