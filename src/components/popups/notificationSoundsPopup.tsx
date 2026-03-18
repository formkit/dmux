#!/usr/bin/env node

/**
 * Standalone popup for configuring notification sounds.
 * Allows multi-selection with space and scope selection before saving.
 */

import React, { useEffect, useMemo, useRef, useState } from "react"
import { render, Box, Text, useApp, useInput } from "ink"
import { readFileSync } from "fs"
import { pathToFileURL } from "url"
import {
  PopupContainer,
  PopupWrapper,
  writeCancelAndExit,
  writeSuccessAndExit,
} from "./shared/index.js"
import { POPUP_CONFIG } from "./config.js"
import type { NotificationSoundId } from "../../utils/notificationSounds.js"
import {
  createNotificationSoundPreviewPlayer,
  type NotificationSoundPreviewPlayer,
} from "../../utils/notificationSoundPreview.js"

interface SoundItem {
  id: NotificationSoundId
  label: string
  defaultEnabled: boolean
}

interface PopupData {
  sounds: SoundItem[]
  enabledNotificationSounds: NotificationSoundId[]
}

interface NotificationSoundsPopupProps {
  resultFile: string
  data: PopupData
  previewPlayer?: NotificationSoundPreviewPlayer
}

export const NotificationSoundsPopupApp: React.FC<NotificationSoundsPopupProps> = ({
  resultFile,
  data,
  previewPlayer,
}) => {
  const [mode, setMode] = useState<"list" | "scope">("list")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scopeIndex, setScopeIndex] = useState(0)
  const [enabled, setEnabled] = useState<Set<NotificationSoundId>>(
    () => new Set(data.enabledNotificationSounds)
  )
  const previewPlayerRef = useRef<NotificationSoundPreviewPlayer>(
    previewPlayer ?? createNotificationSoundPreviewPlayer()
  )
  const { exit } = useApp()

  const orderedEnabledSounds = useMemo(() => {
    return data.sounds
      .map((sound) => sound.id)
      .filter((soundId) => enabled.has(soundId))
  }, [data.sounds, enabled])

  const toggleSelectedSound = () => {
    const selected = data.sounds[selectedIndex]
    if (!selected) return

    const shouldPreview = !enabled.has(selected.id)
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(selected.id)) {
        next.delete(selected.id)
      } else {
        next.add(selected.id)
      }
      return next
    })

    if (shouldPreview) {
      previewPlayerRef.current.play(selected.id)
    }
  }

  useEffect(() => {
    return () => {
      previewPlayerRef.current.stop()
    }
  }, [])

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "scope") {
        setMode("list")
        return
      }
      writeCancelAndExit(resultFile, exit)
      return
    }

    if (mode === "list") {
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1))
        return
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(data.sounds.length - 1, prev + 1))
        return
      }
      if (input === " ") {
        toggleSelectedSound()
        return
      }
      if (key.return && orderedEnabledSounds.length > 0) {
        setMode("scope")
        setScopeIndex(0)
      }
      return
    }

    if (key.upArrow) {
      setScopeIndex((prev) => Math.max(0, prev - 1))
      return
    }
    if (key.downArrow) {
      setScopeIndex((prev) => Math.min(1, prev + 1))
      return
    }
    if (input === "g" || input === "G") {
      setScopeIndex(0)
      return
    }
    if (input === "p" || input === "P") {
      setScopeIndex(1)
      return
    }
    if (key.return) {
      writeSuccessAndExit(
        resultFile,
        {
          enabledNotificationSounds: orderedEnabledSounds,
          scope: scopeIndex === 0 ? "global" : "project",
        },
        exit
      )
    }
  })

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer
        footer={
          mode === "list"
            ? "↑↓ navigate • Space toggle • Enter continue • ESC cancel"
            : "↑↓ navigate • Enter save • g/p quick scope • ESC back"
        }
      >
        {mode === "list" && (
          <Box flexDirection="column">
            <Box marginBottom={1} flexDirection="column">
              <Text dimColor>
                dmux randomizes between the enabled sounds for each macOS background alert.
              </Text>
              <Text dimColor>
                Keep at least one sound enabled.
              </Text>
              <Text color={POPUP_CONFIG.titleColor}>
                Enabled: {orderedEnabledSounds.length}/{data.sounds.length}
              </Text>
            </Box>

            {data.sounds.length === 0 && <Text dimColor>No sounds available</Text>}

            {data.sounds.map((sound, index) => {
              const isSelected = index === selectedIndex
              const isEnabled = enabled.has(sound.id)
              const marker = isEnabled ? "◉" : "◎"
              const markerColor = isEnabled ? POPUP_CONFIG.successColor : "white"
              const defaultTag = sound.defaultEnabled ? " · default" : ""

              return (
                <Box key={sound.id}>
                  <Text color={markerColor} bold={isEnabled}>
                    {marker}
                  </Text>
                  <Text
                    color={isSelected ? POPUP_CONFIG.titleColor : "white"}
                    bold={isSelected}
                  >
                    {" "}
                    {sound.label}
                  </Text>
                  <Text color={isSelected ? POPUP_CONFIG.titleColor : "gray"}>
                    {"  "}
                    {sound.id}{defaultTag}
                  </Text>
                </Box>
              )
            })}

            {orderedEnabledSounds.length === 0 && (
              <Box marginTop={1}>
                <Text color={POPUP_CONFIG.errorColor}>
                  Select at least one sound before continuing.
                </Text>
              </Box>
            )}
          </Box>
        )}

        {mode === "scope" && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold>Save notification sounds as:</Text>
            </Box>

            <Box>
              <Text color={scopeIndex === 0 ? POPUP_CONFIG.titleColor : "white"} bold={scopeIndex === 0}>
                {scopeIndex === 0 ? "▶ " : "  "}Global (all projects)
              </Text>
            </Box>
            <Box>
              <Text color={scopeIndex === 1 ? POPUP_CONFIG.titleColor : "white"} bold={scopeIndex === 1}>
                {scopeIndex === 1 ? "▶ " : "  "}Project only
              </Text>
            </Box>
          </Box>
        )}
      </PopupContainer>
    </PopupWrapper>
  )
}

function main() {
  const resultFile = process.argv[2]
  const tempDataFile = process.argv[3]

  if (!resultFile || !tempDataFile) {
    console.error("Error: Result file and temp data file required")
    process.exit(1)
  }

  let data: PopupData

  try {
    data = JSON.parse(readFileSync(tempDataFile, "utf-8"))
  } catch {
    console.error("Error: Failed to read popup data")
    process.exit(1)
  }

  render(<NotificationSoundsPopupApp resultFile={resultFile} data={data} />)
}

const entryPointHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : ""
if (import.meta.url === entryPointHref) {
  main()
}
