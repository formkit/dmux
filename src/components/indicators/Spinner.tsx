import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface SpinnerProps {
  /** Optional color for the spinner */
  color?: string;
  /** Frame rate in milliseconds (default: 80ms) */
  interval?: number;
}

const Spinner: React.FC<SpinnerProps> = ({ color = 'cyan', interval = 80 }) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return <Text color={color}>{SPINNER_FRAMES[frame]}</Text>;
};

export default Spinner;
