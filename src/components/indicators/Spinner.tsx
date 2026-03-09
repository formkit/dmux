import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface SpinnerProps {
  /** Optional color for the spinner */
  color?: string;
  /** Frame rate in milliseconds (default: 80ms) */
  interval?: number;
  /** Optional custom frames for alternative spinner styles */
  frames?: string[];
}

const Spinner: React.FC<SpinnerProps> = ({
  color = 'cyan',
  interval = 80,
  frames = SPINNER_FRAMES,
}) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [frames, interval]);

  return <Text color={color}>{frames[frame]}</Text>;
};

export default Spinner;
