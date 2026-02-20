#!/usr/bin/env node

/**
 * Standalone popup for selecting a project directory with autocomplete.
 * Runs in a tmux popup modal and writes result to a file.
 */

import React, { useState, useEffect } from "react"
import { render, Box, Text, useApp, useInput } from "ink"
import * as fs from "fs"
import CleanTextInput from "../inputs/CleanTextInput.js"
import {
  PopupContainer,
  PopupWrapper,
  DirectoryList,
  writeSuccessAndExit,
} from "./shared/index.js"
import { POPUP_CONFIG } from "./config.js"
import {
  expandTilde,
  parsePathInput,
  scanDirectories,
  type DirEntry,
} from "../../utils/dirScanner.js"

interface ProjectSelectProps {
  resultFile: string
  defaultValue: string
}

const ProjectSelectApp: React.FC<ProjectSelectProps> = ({
  resultFile,
  defaultValue,
}) => {
  const [value, setValue] = useState(defaultValue)
  const [directories, setDirectories] = useState<DirEntry[]>([])
  const [selectedDirIndex, setSelectedDirIndex] = useState(0)
  const { exit } = useApp()

  // Scan directories on every input change
  useEffect(() => {
    const { parentDir, prefix } = parsePathInput(value)
    const results = scanDirectories(parentDir, prefix)
    setDirectories(results)
    setSelectedDirIndex(0)
  }, [value])

  // Handle keyboard navigation
  useInput((input, key) => {
    // ESC progressive: first clear input, then let PopupWrapper close
    if (key.escape) {
      if (value.length > 0) {
        setValue("")
        return
      }
      // Let PopupWrapper handle close
      return
    }

    // Arrow up/down — navigate directory list
    if (key.upArrow) {
      setSelectedDirIndex((prev) => Math.max(0, prev - 1))
      return
    }
    if (key.downArrow) {
      setSelectedDirIndex((prev) =>
        Math.min(directories.length - 1, prev + 1)
      )
      return
    }

    // Tab — complete selected directory
    if (key.tab && directories.length > 0) {
      const selected = directories[selectedDirIndex]
      if (selected) {
        setValue(selected.fullPath + "/")
      }
      return
    }
  })

  const handleSubmit = (submittedValue?: string) => {
    const finalValue = submittedValue || value
    if (!finalValue.trim()) return
    // Expand tilde before submitting
    const expanded = expandTilde(finalValue)
    writeSuccessAndExit(resultFile, expanded, exit)
  }

  const shouldAllowCancel = () => {
    // Block cancel if there's text in the input
    if (value.length > 0) return false
    return true
  }

  const footer = `Tab complete • Enter submit • ${POPUP_CONFIG.cancelHint}`

  return (
    <PopupWrapper
      resultFile={resultFile}
      allowEscapeToCancel={true}
      shouldAllowCancel={shouldAllowCancel}
    >
      <PopupContainer footer={footer}>
        {/* Input line — no border, just a prompt character */}
        <Box>
          <Text color={POPUP_CONFIG.inputBorderColor} bold>{"❯ "}</Text>
          <CleanTextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder="~/projects/my-app"
            maxWidth={72}
            disableUpDownArrows={true}
            disableEscape={true}
            ignoreFocus={true}
          />
        </Box>

        {/* Directory suggestions — fixed height, no border */}
        <DirectoryList
          directories={directories}
          selectedIndex={selectedDirIndex}
          maxVisible={10}
        />
      </PopupContainer>
    </PopupWrapper>
  )
}

// Entry point
function main() {
  const resultFile = process.argv[2]
  const dataFile = process.argv[3]

  if (!resultFile) {
    console.error("Error: Result file path required")
    process.exit(1)
  }

  let defaultValue = ""
  if (dataFile) {
    try {
      const dataJson = fs.readFileSync(dataFile, "utf-8")
      const data = JSON.parse(dataJson)
      defaultValue = data.defaultValue || ""
    } catch {
      // Ignore parse errors — use empty default
    }
  }

  render(
    <ProjectSelectApp resultFile={resultFile} defaultValue={defaultValue} />
  )
}

main()
