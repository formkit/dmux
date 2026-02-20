import React from "react"
import { Box, Text } from "ink"
import type { DirEntry } from "../../../utils/dirScanner.js"

interface DirectoryListProps {
  directories: DirEntry[]
  selectedIndex: number // -1 means nothing highlighted
  maxVisible?: number
}

/**
 * Fixed-height scrollable directory list for autocomplete.
 * Always renders exactly maxVisible rows to prevent layout shifts.
 */
export const DirectoryList: React.FC<DirectoryListProps> = ({
  directories,
  selectedIndex,
  maxVisible = 8,
}) => {
  const totalDirs = directories.length
  const hasResults = totalDirs > 0

  // Calculate visible window — scroll to keep selection in view
  let startIndex = 0
  let endIndex = Math.min(maxVisible, totalDirs)

  if (hasResults && selectedIndex >= 0) {
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

  // Pad to fixed row count so height never changes
  const emptyRows = maxVisible - visibleDirs.length

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Status line — always present, stable height */}
      <Text dimColor>
        {hasResults
          ? `${totalDirs} ${totalDirs === 1 ? "match" : "matches"}${moreAbove ? "  ↑ more" : ""}${moreBelow ? "  ↓ more" : ""}`
          : "No matches"}
      </Text>

      {/* Directory rows */}
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
