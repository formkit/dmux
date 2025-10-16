import React, { useEffect } from 'react';
import { useInput, useApp } from 'ink';
import * as fs from 'fs';

export interface PopupResult<T = any> {
  success: boolean;
  data?: T;
  cancelled?: boolean;
  error?: string;
}

interface PopupWrapperProps<T = any> {
  resultFile: string;
  children: React.ReactNode;
  onCancel?: () => void;
  onSuccess?: (data: T) => void;
  allowEscapeToCancel?: boolean;
}

/**
 * Shared popup wrapper that handles:
 * - ESC key handling for cancellation
 * - Result file writing
 * - Exit handling
 * - Common popup lifecycle
 */
export function PopupWrapper<T = any>({
  resultFile,
  children,
  onCancel,
  onSuccess,
  allowEscapeToCancel = true,
}: PopupWrapperProps<T>) {
  const { exit } = useApp();

  // Handle ESC key for cancellation
  useInput((input, key) => {
    if (allowEscapeToCancel && key.escape) {
      if (onCancel) {
        onCancel();
      }
      const result: PopupResult = {
        success: false,
        cancelled: true,
      };
      try {
        fs.writeFileSync(resultFile, JSON.stringify(result));
      } catch (error) {
        // If we can't write result, try stderr as fallback
        console.error('[PopupWrapper] Failed to write result file:', error);
      }
      exit();
    }
  });

  return <>{children}</>;
}

/**
 * Helper function to write success result and exit
 */
export function writeSuccessAndExit<T>(resultFile: string, data: T, exit: () => void) {
  const result: PopupResult<T> = {
    success: true,
    data,
  };
  try {
    fs.writeFileSync(resultFile, JSON.stringify(result));
  } catch (error) {
    console.error('[PopupWrapper] Failed to write success result:', error);
  }
  exit();
}

/**
 * Helper function to write error result and exit
 */
export function writeErrorAndExit(resultFile: string, error: string, exit: () => void) {
  const result: PopupResult = {
    success: false,
    error,
  };
  try {
    fs.writeFileSync(resultFile, JSON.stringify(result));
  } catch (err) {
    console.error('[PopupWrapper] Failed to write error result:', err);
  }
  exit();
}

/**
 * Helper function to write cancellation result and exit
 */
export function writeCancelAndExit(resultFile: string, exit: () => void) {
  const result: PopupResult = {
    success: false,
    cancelled: true,
  };
  try {
    fs.writeFileSync(resultFile, JSON.stringify(result));
  } catch (error) {
    console.error('[PopupWrapper] Failed to write cancel result:', error);
  }
  exit();
}
