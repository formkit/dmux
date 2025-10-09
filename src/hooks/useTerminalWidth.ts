import { useEffect, useState } from 'react';
import { execSync } from 'child_process';

export default function useTerminalWidth() {
  const [terminalWidth, setTerminalWidth] = useState<number>(process.stdout.columns || 80);
  // Repaint trigger forces Ink to re-render after resize clearing
  const [repaintTrigger, setRepaintTrigger] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      const newWidth = process.stdout.columns || 80;
      setTerminalWidth(newWidth);

      // Clear screen artifacts when terminal is resized
      // This happens when tmux panes are closed/opened, causing layout shifts
      try {
        // Clear screen with ANSI codes
        process.stdout.write('\x1b[2J\x1b[H');

        // Clear tmux history
        execSync('tmux clear-history', { stdio: 'pipe' });

        // Force tmux to refresh the display
        execSync('tmux refresh-client', { stdio: 'pipe' });
      } catch {
        // Ignore errors if not in tmux or commands fail
      }

      // Force Ink to re-render immediately after clearing
      // Small delay ensures terminal processes the clear first
      setTimeout(() => {
        setRepaintTrigger(prev => prev + 1);
      }, 50);
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.removeListener('resize', handleResize);
    };
  }, []);

  return terminalWidth;
}
