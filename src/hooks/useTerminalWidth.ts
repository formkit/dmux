import { useEffect, useState } from 'react';
import { TmuxService } from '../services/TmuxService.js';

export default function useTerminalWidth() {
  const tmuxService = TmuxService.getInstance();
  const [terminalWidth, setTerminalWidth] = useState<number>(process.stdout.columns || 80);
  // Repaint trigger forces Ink to re-render after resize clearing
  const [repaintTrigger, setRepaintTrigger] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      const newWidth = process.stdout.columns || 80;
      setTerminalWidth(newWidth);

      // CRITICAL: Force re-render FIRST before clearing
      // This prevents blank screen during terminal resize
      setRepaintTrigger(prev => prev + 1);

      // Clear screen artifacts when terminal is resized
      // This happens when tmux panes are closed/opened, causing layout shifts
      // Clear screen with ANSI codes
      process.stdout.write('\x1b[2J\x1b[H');

      // Clear tmux history and refresh (using TmuxService for proper error handling)
      tmuxService.clearHistorySync();
      tmuxService.refreshClientSync();
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.removeListener('resize', handleResize);
    };
  }, []);

  return terminalWidth;
}
