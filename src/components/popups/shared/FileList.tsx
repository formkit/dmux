import React from 'react';
import { Box, Text } from 'ink';
import { POPUP_CONFIG } from '../config.js';

interface FileListProps {
  files: string[];
  selectedIndex: number;
  maxVisible?: number;
}

/**
 * Displays a scrollable list of files with the selected file highlighted
 * Used for @ file autocomplete in the new pane popup
 */
export const FileList: React.FC<FileListProps> = ({
  files,
  selectedIndex,
  maxVisible = 10
}) => {
  if (files.length === 0) {
    return (
      <Box marginTop={1}>
        <Text dimColor italic>No files found</Text>
      </Box>
    );
  }

  // Calculate visible window (scrolling)
  const totalFiles = files.length;
  let startIndex = 0;
  let endIndex = Math.min(maxVisible, totalFiles);

  // Scroll the window to keep selected file visible
  if (selectedIndex >= endIndex) {
    // Selected is below visible window, scroll down
    endIndex = selectedIndex + 1;
    startIndex = Math.max(0, endIndex - maxVisible);
  } else if (selectedIndex < startIndex) {
    // Selected is above visible window, scroll up
    startIndex = selectedIndex;
    endIndex = Math.min(startIndex + maxVisible, totalFiles);
  }

  // Adjust window to keep selected in middle when possible
  if (selectedIndex >= maxVisible / 2 && totalFiles > maxVisible) {
    startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
    endIndex = Math.min(startIndex + maxVisible, totalFiles);
    startIndex = endIndex - maxVisible;
  }

  const visibleFiles = files.slice(startIndex, endIndex);
  const showScrollIndicators = totalFiles > maxVisible;

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle={POPUP_CONFIG.inputBorderStyle}
      borderColor="cyan"
      paddingX={1}
      width="100%"
    >
      {/* Header */}
      <Box marginBottom={0}>
        <Text dimColor>
          Files ({totalFiles}) - Use ↑↓ to navigate, Tab/Enter to select, Esc to cancel
        </Text>
      </Box>

      {/* Scroll indicator - top */}
      {showScrollIndicators && startIndex > 0 && (
        <Box justifyContent="center">
          <Text dimColor>↑ {startIndex} more above</Text>
        </Box>
      )}

      {/* File list */}
      <Box flexDirection="column">
        {visibleFiles.map((file, idx) => {
          const actualIndex = startIndex + idx;
          const isSelected = actualIndex === selectedIndex;

          return (
            <Box key={actualIndex}>
              <Text
                color={isSelected ? 'black' : undefined}
                backgroundColor={isSelected ? 'cyan' : undefined}
                bold={isSelected}
              >
                {isSelected ? '▶ ' : '  '}{file}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Scroll indicator - bottom */}
      {showScrollIndicators && endIndex < totalFiles && (
        <Box justifyContent="center">
          <Text dimColor>↓ {totalFiles - endIndex} more below</Text>
        </Box>
      )}
    </Box>
  );
};
