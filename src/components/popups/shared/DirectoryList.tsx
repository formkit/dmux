import React from "react"
import { Box, Text } from "ink"
import type { DirEntry } from "../../../utils/dirScanner.js"

interface DirectoryListProps {
  directories: DirEntry[]
  selectedIndex: number
  maxVisible?: number
}

/**
 * Displays a fixed-height scrollable list of directories with git repo indicators.
 * Uses stable row count to prevent layout shifts in the terminal.
 */
export const DirectoryList: React.FC<DirectoryListProps> = ({
  directories,
  selectedIndex,
  maxVisible = 8,
}) => {
  const totalDirs = directories.length
  const hasResults = totalDirs > 0

  // Calculate visible window (scrolling)
  let startIndex = 0
  let endIndex = Math.min(maxVisible, totalDirs)

  if (hasResults) {
    // Keep selected item centered when possible
    if (selectedIndex >= maxVisible / 2 && totalDirs > maxVisible) {
      startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2))
      endIndex = Math.min(startIndex + maxVisible, totalDirs)
      startIndex = endIndex - maxVisible
    } else if (selectedIndex >= endIndex) {
      endIndex = selectedIndex + 1
      startIndex = Math.max(0, endIndex - maxVisible)
    }
  }

  const visibleDirs = directories.slice(startIndex, endIndex)
  const moreAbove = startIndex > 0
  const moreBelow = endIndex < totalDirs

  // Pad to fixed row count so height never changes.
  // Each dir entry takes 1 row (name only). We always render maxVisible rows.
  const emptyRows = maxVisible - visibleDirs.length

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Status line — always present */}
      <Text dimColor>
        {hasResults
          ? `${totalDirs} ${totalDirs === 1 ? "match" : "matches"}${moreAbove ? "  ↑ more" : ""}${moreBelow ? "  ↓ more" : ""}`
          : "No matches"}
      </Text>

      {/* Fixed-height directory rows */}
      {visibleDirs.map((dir, idx) => {
        const actualIndex = startIndex + idx
        const isSelected = actualIndex === selectedIndex

        return (
          <Box key={actualIndex}>
            <Text
              color={isSelected ? "black" : undefined}
              backgroundColor={isSelected ? "cyan" : undefined}
              bold={isSelected}
            >
              {isSelected ? "▸ " : "  "}
              {dir.name}/
            </Text>
            {dir.isGitRepo && (
              <Text color="cyan"> [git]</Text>
            )}
            <Text dimColor> {dir.fullPath}</Text>
          </Box>
        )
      })}

      {/* Empty padding rows to maintain stable height */}
      {Array.from({ length: emptyRows }).map((_, i) => (
        <Box key={`empty-${i}`}>
          <Text> </Text>
        </Box>
      ))}
    </Box>
  )
}
