import { useEffect, useRef } from 'react';
import { enforceControlPaneSize } from '../utils/tmux.js';
import { SIDEBAR_WIDTH } from '../utils/layoutManager.js';
import { LogService } from '../services/LogService.js';

interface LayoutManagementOptions {
  controlPaneId: string | undefined;
  hasActiveDialog: boolean;
  focusedMode?: boolean;
  focusedPaneId?: string;
}

/**
 * Manages periodic enforcement of control pane (sidebar) size
 * Ensures the sidebar stays at SIDEBAR_WIDTH (40 chars) even after terminal resizes
 */
export function useLayoutManagement({
  controlPaneId,
  hasActiveDialog,
  focusedMode,
  focusedPaneId,
}: LayoutManagementOptions) {
  // Use refs to track state across resize events
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isApplyingLayoutRef = useRef(false);
  // Track if component is still mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!controlPaneId) {
      return; // No sidebar layout configured
    }

    // Enforce sidebar width immediately on mount (with error handling)
    enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH, { focusedMode, focusedPaneId }).catch(error => {
      LogService.getInstance().warn(
        `Initial layout enforcement failed: ${error}`,
        'ResizeDebug'
      );
    });

    const handleResize = () => {
      // Skip if we're already applying a layout (prevents loops and race conditions)
      if (isApplyingLayoutRef.current) {
        return;
      }

      // Clear any pending resize
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Debounce: wait 500ms after last resize event (prevents excessive recalculations)
      resizeTimeoutRef.current = setTimeout(async () => {
        // Check if component is still mounted
        if (!isMountedRef.current) {
          return;
        }

        // Only enforce if not showing dialogs (to avoid interference)
        if (!hasActiveDialog) {
          // Double-check we're not already applying (race condition protection)
          if (isApplyingLayoutRef.current) {
            return;
          }
          isApplyingLayoutRef.current = true;

          try {
            // Only enforce sidebar width when terminal resizes
            await enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH, { focusedMode, focusedPaneId });

            // Check if still mounted before updating UI
            if (!isMountedRef.current) {
              return;
            }

          } catch (error) {
            // Log error but don't crash - layout will be retried on next resize
            LogService.getInstance().warn(
              `Layout enforcement failed during resize: ${error}`,
              'ResizeDebug'
            );
          } finally {
            // Reset flag after a brief delay (always reset, even on error)
            setTimeout(() => {
              if (isMountedRef.current) {
                isApplyingLayoutRef.current = false;
              }
            }, 100);
          }
        }
      }, 500);
    };

    // Listen to stdout resize events
    process.stdout.on('resize', handleResize);

    // Also listen for SIGWINCH and SIGUSR1 (tmux hook sends USR1)
    process.on('SIGWINCH', handleResize);
    process.on('SIGUSR1', handleResize);

    return () => {
      isMountedRef.current = false;
      process.stdout.off('resize', handleResize);
      process.off('SIGWINCH', handleResize);
      process.off('SIGUSR1', handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [controlPaneId, hasActiveDialog, focusedMode, focusedPaneId]);
}
