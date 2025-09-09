import { useEffect, useState } from 'react';

export default function useTerminalWidth() {
  const [terminalWidth, setTerminalWidth] = useState<number>(process.stdout.columns || 80);

  useEffect(() => {
    const handleResize = () => setTerminalWidth(process.stdout.columns || 80);
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.removeListener('resize', handleResize);
    };
  }, []);

  return terminalWidth;
}
