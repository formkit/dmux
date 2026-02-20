import React from "react"
import { Box, Text } from "ink"
import { POPUP_CONFIG } from "../config.js"
import type { DirEntry } from "../../../utils/dirScanner.js"

interface DirectoryListProps {
  directories: DirEntry[]
  selectedIndex: number
  maxVisible?: number
}

/**
 * Displays a scrollable list of directories with git repo indicators.
 * Used for directory autocomplete in the project select popup.
 */
export const DirectoryList: React.FC<DirectoryListProps> = ({
  directories,
  selectedIndex,
  maxVisible = 10,
}) => {
  if (directories.length === 0) {
    return (
      <Box marginTop={1}>
        <Text dimColor italic>
          No directories found
        </Text>
      </Box>
    )
  }

  // Calculate visible window (scrolling)
  const totalDirs = directories.length
  let startIndex = 0
  let endIndex = Math.min(maxVisible, totalDirs)

  // Keep selected item centered when possible
  if (selectedIndex >= maxVisible / 2 && totalDirs > maxVisible) {
    startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2))
    endIndex = Math.min(startIndex + maxVisible, totalDirs)
    startIndex = endIndex - maxVisible
  } else if (selectedIndex >= endIndex) {
    endIndex = selectedIndex + 1
    startIndex = Math.max(0, endIndex - maxVisible)
  }

  const visibleDirs = directories.slice(startIndex, endIndex)
  const showScrollIndicators = totalDirs > maxVisible

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
          Directories ({totalDirs}) — ↑↓ navigate, Tab complete
        </Text>
      </Box>

      {/* Scroll indicator - top */}
      {showScrollIndicators && startIndex > 0 && (
        <Box justifyContent="center">
          <Text dimColor>↑ {startIndex} more above</Text>
        </Box>
      )}

      {/* Directory list */}
      <Box flexDirection="column">
        {visibleDirs.map((dir, idx) => {
          const actualIndex = startIndex + idx
          const isSelected = actualIndex === selectedIndex

          return (
            <Box key={actualIndex} flexDirection="column">
              <Box>
                <Text
                  color={isSelected ? "black" : undefined}
                  backgroundColor={isSelected ? "cyan" : undefined}
                  bold={isSelected}
                >
                  {isSelected ? "▶ " : "  "}
                  {dir.name}/
                </Text>
                {dir.isGitRepo && (
                  <Text color="cyan" bold={isSelected}>
                    {" "}
                    [git]
                  </Text>
                )}
              </Box>
              <Box>
                <Text dimColor>
                  {"    "}
                  {dir.fullPath}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>

      {/* Scroll indicator - bottom */}
      {showScrollIndicators && endIndex < totalDirs && (
        <Box justifyContent="center">
          <Text dimColor>↓ {totalDirs - endIndex} more below</Text>
        </Box>
      )}
    </Box>
  )
}
