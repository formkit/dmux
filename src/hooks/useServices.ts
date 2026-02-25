import { useMemo } from "react"
import { PopupManager, type PopupManagerConfig } from "../services/PopupManager.js"
import type { ProjectSettings } from "../types.js"
import type { AgentName } from "../utils/agentLaunch.js"

interface UseServicesProps {
  // PopupManager config
  sidebarWidth: number
  projectRoot: string
  popupsSupported: boolean
  isDevMode: boolean
  terminalWidth: number
  terminalHeight: number
  controlPaneId?: string
  availableAgents: AgentName[]
  settingsManager: any
  projectSettings: ProjectSettings

  // Callbacks
  setStatusMessage: (msg: string) => void
  setIgnoreInput: (ignore: boolean) => void
}

export function useServices(props: UseServicesProps) {
  // Initialize PopupManager
  const popupManager = useMemo(() => {
    const config: PopupManagerConfig = {
      sidebarWidth: props.sidebarWidth,
      projectRoot: props.projectRoot,
      popupsSupported: props.popupsSupported,
      isDevMode: props.isDevMode,
      terminalWidth: props.terminalWidth,
      terminalHeight: props.terminalHeight,
      controlPaneId: props.controlPaneId,
      availableAgents: props.availableAgents,
      settingsManager: props.settingsManager,
      projectSettings: props.projectSettings,
    }

    return new PopupManager(
      config,
      props.setStatusMessage,
      props.setIgnoreInput
    )
  }, [
    props.sidebarWidth,
    props.projectRoot,
    props.popupsSupported,
    props.isDevMode,
    props.terminalWidth,
    props.terminalHeight,
    props.controlPaneId,
    props.availableAgents,
    props.settingsManager,
    props.projectSettings,
    props.setStatusMessage,
    props.setIgnoreInput,
  ])

  return {
    popupManager,
  }
}
