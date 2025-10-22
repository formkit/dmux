import React from 'react';
import { Text } from 'ink';
import Spinner from './Spinner.js';

const LoadingIndicator: React.FC = () => {
  return (
    <Text color="gray">
      <Spinner color="gray" /> Loading panes
    </Text>
  );
};

export default LoadingIndicator;
