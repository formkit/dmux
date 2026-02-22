#!/usr/bin/env node

/**
 * Standalone popup for selecting a project directory with autocomplete.
 * Runs in a tmux popup modal and writes result to a file.
 */

import React, { useState, useMemo, useRef } from "react"
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
  // -1 = nothing highlighted, user must press ↓ to enter the list
  const [selectedDirIndex, setSelectedDirIndex] = useState(-1)
  const { exit } = useApp()

  // Derive directories synchronously — no useEffect, no extra render cycle
  const directories = useMemo(() => {
    const { parentDir, prefix } = parsePathInput(value)
    return scanDirectories(parentDir, prefix)
  }, [value])

  // Reset selection when value changes (back to "nothing highlighted")
  const prevValueRef = useRef(value)
  if (value !== prevValueRef.current) {
    prevValueRef.current = value
    if (selectedDirIndex !== -1) {
      setSelectedDirIndex(-1)
    }
  }

  // Navigate into the highlighted directory (append to input)
  const navigateIntoSelected = () => {
    if (selectedDirIndex >= 0 && selectedDirIndex < directories.length) {
      const selected = directories[selectedDirIndex]
      if (selected) {
        setValue(selected.fullPath + "/")
      }
    }
  }

  // Handle keyboard navigation
  useInput((input, key) => {
    // ESC: if something is highlighted, deselect it first;
    // then clear input; then let PopupWrapper close
    if (key.escape) {
      if (selectedDirIndex >= 0) {
        setSelectedDirIndex(-1)
        return
      }
      if (value.length > 0) {
        setValue("")
        return
      }
      return
    }

    // ↑/↓ — navigate directory list
    if (key.downArrow) {
      if (directories.length > 0) {
        setSelectedDirIndex((prev) =>
          Math.min(directories.length - 1, prev + 1)
        )
      }
      return
    }
    if (key.upArrow) {
      setSelectedDirIndex((prev) => Math.max(-1, prev - 1))
      return
    }

    // Tab — autocomplete first match (or highlighted match)
    if (key.tab && directories.length > 0) {
      const idx = selectedDirIndex >= 0 ? selectedDirIndex : 0
      const selected = directories[idx]
      if (selected) {
        setValue(selected.fullPath + "/")
      }
      return
    }
  })

  const handleSubmit = (submittedValue?: string) => {
    const finalValue = submittedValue || value
    if (!finalValue.trim()) return

    // If a directory is highlighted, Enter navigates into it
    if (selectedDirIndex >= 0) {
      navigateIntoSelected()
      return
    }

    // Nothing highlighted — submit the current value
    const expanded = expandTilde(finalValue)
    writeSuccessAndExit(resultFile, expanded, exit)
  }

  const shouldAllowCancel = () => {
    if (selectedDirIndex >= 0) return false
    if (value.length > 0) return false
    return true
  }

  const footer = `↓ browse • Tab complete • Enter submit • ${POPUP_CONFIG.cancelHint}`

  return (
    <PopupWrapper
      resultFile={resultFile}
      allowEscapeToCancel={true}
      shouldAllowCancel={shouldAllowCancel}
    >
      <PopupContainer footer={footer}>
        {/* Input — CleanTextInput renders its own "> " prompt */}
        <CleanTextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="~/projects/my-app"
          maxWidth={72}
          cursorPosition={value.length}
          disableUpDownArrows={true}
          disableEscape={true}
          ignoreFocus={true}
        />

        {/* Directory suggestions — fixed-height scroll area */}
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
