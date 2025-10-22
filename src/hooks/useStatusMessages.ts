import { useState, useCallback } from 'react';

/**
 * Manages temporary status messages with optional auto-dismiss
 * Provides a centralized way to show feedback to users
 */
export function useStatusMessages() {
  const [statusMessage, setStatusMessage] = useState('');

  /**
   * Shows a status message, optionally clearing it after a delay
   */
  const showStatus = useCallback((message: string, duration?: number) => {
    setStatusMessage(message);

    if (duration) {
      setTimeout(() => {
        setStatusMessage('');
      }, duration);
    }
  }, []);

  /**
   * Clears the current status message immediately
   */
  const clearStatus = useCallback(() => {
    setStatusMessage('');
  }, []);

  return {
    statusMessage,
    setStatusMessage,
    showStatus,
    clearStatus,
  };
}
