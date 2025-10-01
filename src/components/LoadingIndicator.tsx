import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const LoadingIndicator: React.FC = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <Text color="gray">
      Loading panes{dots}
    </Text>
  );
};

export default LoadingIndicator;
