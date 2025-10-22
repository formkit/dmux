import { useCallback, useRef } from 'react';

/**
 * Hook for showing temporary status messages that auto-clear
 *
 * @param setStatusMessage - Function to set the status message
 * @returns showTemporary - Function to show a message that clears after timeout
 *
 * @example
 * const showTemporary = useTemporaryStatus(setStatusMessage);
 * showTemporary('File saved successfully');  // Clears after 3s
 * showTemporary('Processing...', 2000);      // Clears after 2s
 */
export function useTemporaryStatus(
  setStatusMessage: (msg: string) => void
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTemporary = useCallback(
    (message: string, timeout: number = 3000) => {
      // Clear any existing timeout to avoid race conditions
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set the new message
      setStatusMessage(message);

      // Schedule automatic clearing
      timeoutRef.current = setTimeout(() => {
        setStatusMessage('');
        timeoutRef.current = null;
      }, timeout);
    },
    [setStatusMessage]
  );

  return showTemporary;
}
