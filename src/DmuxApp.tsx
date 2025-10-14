import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

// Hooks
import usePanes from './hooks/usePanes.js';
import useProjectSettings from './hooks/useProjectSettings.js';
import useTerminalWidth from './hooks/useTerminalWidth.js';
import useNavigation from './hooks/useNavigation.js';
import useAutoUpdater from './hooks/useAutoUpdater.js';
import useAgentDetection from './hooks/useAgentDetection.js';
import useAgentStatus from './hooks/useAgentStatus.js';
import usePaneRunner from './hooks/usePaneRunner.js';
import usePaneCreation from './hooks/usePaneCreation.js';
import useActionSystem from './hooks/useActionSystem.js';

// Utils
import { getPanePositions, enforceControlPaneSize, SIDEBAR_WIDTH } from './utils/tmux.js';
import { suggestCommand } from './utils/commands.js';
import { generateSlug } from './utils/slug.js';
import { getMainBranch } from './utils/git.js';
import { capturePaneContent } from './utils/paneCapture.js';
import { StateManager } from './shared/StateManager.js';
import { getStatusDetector, type StatusUpdateEvent } from './services/StatusDetector.js';
import { PaneAction, getAvailableActions, type ActionMetadata } from './actions/index.js';
import { SettingsManager, SETTING_DEFINITIONS } from './utils/settingsManager.js';
import { launchNodePopup, supportsPopups } from './utils/popup.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
import type { DmuxPane, PanePosition, ProjectSettings, DmuxAppProps } from './types.js';
import PanesGrid from './components/PanesGrid.js';
import NewPaneDialog from './components/NewPaneDialog.js';
import CommandPromptDialog from './components/CommandPromptDialog.js';
import FileCopyPrompt from './components/FileCopyPrompt.js';
import LoadingIndicator from './components/LoadingIndicator.js';
import RunningIndicator from './components/RunningIndicator.js';
import UpdatingIndicator from './components/UpdatingIndicator.js';
import CreatingIndicator from './components/CreatingIndicator.js';
import FooterHelp from './components/FooterHelp.js';
import QRCode from './components/QRCode.js';


const DmuxApp: React.FC<DmuxAppProps> = ({ panesFile, projectName, sessionName, settingsFile, projectRoot, autoUpdater, serverPort, server, controlPaneId }) => {
  /* panes state moved to usePanes */
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showNewPaneDialog, setShowNewPaneDialog] = useState(false);
  const [newPanePrompt, setNewPanePrompt] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isCreatingPane, setIsCreatingPane] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [isCreatingTunnel, setIsCreatingTunnel] = useState(false);

  // Settings state
  const [settingsManager] = useState(() => new SettingsManager(projectRoot));
  // Force repaint trigger - incrementing this causes Ink to re-render
  const [forceRepaintTrigger, setForceRepaintTrigger] = useState(0);
  // Spinner state - shows for a few frames to force render
  const [showRepaintSpinner, setShowRepaintSpinner] = useState(false);
  const { projectSettings, saveSettings } = useProjectSettings(settingsFile);
  const [showCommandPrompt, setShowCommandPrompt] = useState<'test' | 'dev' | null>(null);
  const [commandInput, setCommandInput] = useState('');
  const [showFileCopyPrompt, setShowFileCopyPrompt] = useState(false);
  const [currentCommandType, setCurrentCommandType] = useState<'test' | 'dev' | null>(null);
  const [runningCommand, setRunningCommand] = useState(false);
  const [quitConfirmMode, setQuitConfirmMode] = useState(false);
  // Debug message state - for temporary logging messages
  const [debugMessage, setDebugMessage] = useState<string>('');
  // Update state handled by hook
  const { updateInfo, showUpdateDialog, isUpdating, performUpdate, skipUpdate, dismissUpdate, updateAvailable } = useAutoUpdater(autoUpdater, setStatusMessage);
  const { exit } = useApp();

  // Agent selection state
  const { availableAgents } = useAgentDetection();
  const [agentChoice, setAgentChoice] = useState<'claude' | 'opencode' | null>(null);

  // Popup support detection
  const [popupsSupported, setPopupsSupported] = useState(false);

  // Track terminal dimensions for responsive layout
  const terminalWidth = useTerminalWidth();

  // Track unread error count for logs badge
  const [unreadErrorCount, setUnreadErrorCount] = useState(0);

  // Subscribe to StateManager for unread error count updates
  useEffect(() => {
    const stateManager = StateManager.getInstance();

    const updateErrorCount = () => {
      setUnreadErrorCount(stateManager.getUnreadErrorCount());
    };

    // Initial count
    updateErrorCount();

    // Subscribe to changes
    const unsubscribe = stateManager.subscribe(updateErrorCount);

    return () => {
      unsubscribe();
    };
  }, []);

  // Panes state and persistence (skipLoading will be updated after actionSystem is initialized)
  const { panes, setPanes, isLoading, loadPanes, savePanes } = usePanes(panesFile, false);

  // Track intentionally closed panes to prevent race condition
  // When a user closes a pane, we add it to this set. If the worker detects
  // the pane is gone (which it will), we check this set first before re-saving.
  const intentionallyClosedPanes = React.useRef<Set<string>>(new Set());

  // Pane runner
  const { copyNonGitFiles, runCommandInternal, monitorTestOutput, monitorDevOutput, attachBackgroundWindow } = usePaneRunner({
    panes,
    savePanes,
    projectSettings,
    setStatusMessage,
    setRunningCommand,
  });

  // Force repaint helper - shows spinner for a few frames to force full re-render
  const forceRepaint = () => {
    setForceRepaintTrigger(prev => prev + 1);
    setShowRepaintSpinner(true);
    // Hide spinner after a few frames (enough to trigger multiple renders)
    setTimeout(() => setShowRepaintSpinner(false), 100);
  };

  // Force repaint effect - ensures Ink re-renders when trigger changes
  useEffect(() => {
    if (forceRepaintTrigger > 0) {
      // Small delay to ensure terminal is ready
      const timer = setTimeout(() => {
        try {
          execSync('tmux refresh-client', { stdio: 'pipe' });
        } catch {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [forceRepaintTrigger]);

  // Pane creation
  const { createNewPane: createNewPaneHook } = usePaneCreation({
    panes,
    savePanes,
    projectName,
    setIsCreatingPane,
    setStatusMessage,
    setNewPanePrompt,
    loadPanes,
    panesFile,
    availableAgents,
    forceRepaint,
  });
  
  // Listen for status updates with analysis data and merge into panes
  useEffect(() => {
    const statusDetector = getStatusDetector();

    const handleStatusUpdate = (event: StatusUpdateEvent) => {
      setPanes(prevPanes => {
        const updatedPanes = prevPanes.map(pane => {
          if (pane.id === event.paneId) {
            const updated: DmuxPane = {
              ...pane,
              agentStatus: event.status,
            };

            // Only update analysis fields if they're present in the event (not undefined)
            // This prevents simple status changes from overwriting PaneAnalyzer results
            if (event.optionsQuestion !== undefined) {
              updated.optionsQuestion = event.optionsQuestion;
            }
            if (event.options !== undefined) {
              updated.options = event.options;
            }
            if (event.potentialHarm !== undefined) {
              updated.potentialHarm = event.potentialHarm;
            }
            if (event.summary !== undefined) {
              updated.agentSummary = event.summary;
            }
            if (event.analyzerError !== undefined) {
              updated.analyzerError = event.analyzerError;
            }

            // Clear option dialog data when transitioning away from 'waiting' state
            if (event.status !== 'waiting' && pane.agentStatus === 'waiting') {
              updated.optionsQuestion = undefined;
              updated.options = undefined;
              updated.potentialHarm = undefined;
            }

            // Clear summary when transitioning away from 'idle' state
            if (event.status !== 'idle' && pane.agentStatus === 'idle') {
              updated.agentSummary = undefined;
            }

            // Clear analyzer error when successfully getting a new analysis
            // or when transitioning to 'working' status
            if (event.status === 'working') {
              updated.analyzerError = undefined;
            } else if (event.status === 'waiting' || event.status === 'idle') {
              if (event.analyzerError === undefined && (event.optionsQuestion || event.summary)) {
                updated.analyzerError = undefined;
              }
            }

            return updated;
          }
          return pane;
        });

        // Persist to disk - ConfigWatcher will handle syncing to StateManager
        savePanes(updatedPanes).catch(err => {
          console.error('Failed to save panes after status update:', err);
        });

        return updatedPanes;
      });
    };

    statusDetector.on('status-updated', handleStatusUpdate);

    return () => {
      statusDetector.off('status-updated', handleStatusUpdate);
    };
  }, [setPanes, savePanes]);

  // Note: No need to sync panes with StateManager here.
  // The ConfigWatcher automatically updates StateManager when the config file changes.
  // This prevents unnecessary SSE broadcasts on every local state update.

  // Sync settings with StateManager
  useEffect(() => {
    const stateManager = StateManager.getInstance();
    stateManager.updateSettings(projectSettings);
  }, [projectSettings]);

  // Expose debug message setter via StateManager
  useEffect(() => {
    const stateManager = StateManager.getInstance();
    stateManager.setDebugMessageCallback(setDebugMessage);
    return () => {
      stateManager.setDebugMessageCallback(undefined);
    };
  }, []);

  // Load panes and settings on mount and refresh periodically
  useEffect(() => {
    // SIGTERM should quit immediately (for process management)
    const handleTermination = () => {
      cleanExit();
    };
    process.on('SIGTERM', handleTermination);

    // Check if tmux supports popups (3.2+)
    setPopupsSupported(supportsPopups());

    // Test debug message on mount
    StateManager.getInstance().setDebugMessage('Debug logging initialized - watching for AI activity...');
    setTimeout(() => {
      StateManager.getInstance().setDebugMessage('');
    }, 3000);

    return () => {
      process.removeListener('SIGTERM', handleTermination);
    };
  }, []);

  // Update checking moved to useAutoUpdater

  // Set default agent choice when detection completes
  useEffect(() => {
    if (agentChoice == null && availableAgents.length > 0) {
      setAgentChoice(availableAgents[0] || 'claude');
    }
  }, [availableAgents]);

  // loadPanes moved to usePanes

  // getPanePositions moved to utils/tmux

  // Navigation logic moved to hook
  const { getCardGridPosition, findCardInDirection } = useNavigation(terminalWidth, panes.length, isLoading);

  // findCardInDirection provided by useNavigation


  // savePanes moved to usePanes

  // applySmartLayout moved to utils/tmux






  const launchNewPanePopup = async () => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    try {
      // Resolve the popup script path from the project root
      // This handles both dev (tsx running from src) and prod (compiled to dist)
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'newPanePopup.js');

      // Launch the popup and wait for result
      // Center over content area (accounting for 40-char sidebar)
      const result = await launchNodePopup<string>(
        popupScriptPath,
        [],
        {
          width: 90,
          height: 18,
          title: '  ✨ dmux - Create New Pane  ',
          centered: true,
          leftOffset: SIDEBAR_WIDTH  // Account for sidebar when centering
        }
      );

      if (result.success && result.data) {
        // User entered a prompt - now decide which agent to use
        const promptValue = result.data;
        const agents = availableAgents;

        if (agents.length === 0) {
          await createNewPaneHook(promptValue);
        } else if (agents.length === 1) {
          await createNewPaneHook(promptValue, agents[0]);
        } else {
          // Multiple agents available - check for default agent setting first
          const settings = settingsManager.getSettings();
          if (settings.defaultAgent && agents.includes(settings.defaultAgent)) {
            // Use the default agent from settings
            await createNewPaneHook(promptValue, settings.defaultAgent);
          } else {
            // No default agent configured or default not available - show agent choice popup
            const selectedAgent = await launchAgentChoicePopup(promptValue);
            if (selectedAgent) {
              await createNewPaneHook(promptValue, selectedAgent);
            }
          }
        }
      } else if (result.cancelled) {
        // User pressed ESC - do nothing
        return;
      } else if (result.error) {
        setStatusMessage(`Popup error: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 3000);
      }
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const launchKebabMenuPopup = async (paneIndex: number) => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    const selectedPane = panes[paneIndex];
    if (!selectedPane) {
      return;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'kebabMenuPopup.js');

      // Get available actions for this pane
      const actions = getAvailableActions(selectedPane, projectSettings);
      const actionsJson = JSON.stringify(actions);

      // Launch the popup - position at top, 1 char right of sidebar
      const result = await launchNodePopup<string>(
        popupScriptPath,
        [selectedPane.slug, actionsJson],
        {
          width: 60,
          height: Math.min(20, actions.length + 5),
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      if (result.success && result.data) {
        // User selected an action - execute it
        const actionId = result.data as PaneAction;
        actionSystem.executeAction(actionId, selectedPane, { mainBranch: getMainBranch() });
      } else if (result.cancelled) {
        // User pressed ESC - do nothing
        return;
      } else if (result.error) {
        setStatusMessage(`Popup error: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 3000);
      }
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const launchConfirmPopup = async (title: string, message: string, yesLabel?: string, noLabel?: string): Promise<boolean> => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return false;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'confirmPopup.js');

      // Write data to temp file to avoid shell escaping issues
      const dataFile = `/tmp/dmux-confirm-${Date.now()}.json`;
      const dataJson = JSON.stringify({ title, message, yesLabel, noLabel });
      await fs.writeFile(dataFile, dataJson);

      // Launch the popup - position at top, 1 char right of sidebar
      const result = await launchNodePopup<boolean>(
        popupScriptPath,
        [dataFile],
        {
          width: 60,
          height: 12,
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      // Clean up temp file
      try {
        await fs.unlink(dataFile);
      } catch {}

      if (result.success && result.data !== undefined) {
        return result.data;
      } else if (result.cancelled) {
        return false;
      } else if (result.error) {
        setStatusMessage(`Popup error: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 3000);
        return false;
      }
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
    return false;
  };

  const launchAgentChoicePopup = async (prompt: string): Promise<'claude' | 'opencode' | null> => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return null;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'agentChoicePopup.js');

      const agentsJson = JSON.stringify(availableAgents);
      const defaultAgentArg = agentChoice || availableAgents[0] || 'claude';

      // Launch the popup - position at top, 1 char right of sidebar
      const result = await launchNodePopup<'claude' | 'opencode'>(
        popupScriptPath,
        [agentsJson, defaultAgentArg],
        {
          width: 50,
          height: 10,
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      if (result.success && result.data) {
        return result.data;
      } else if (result.cancelled) {
        return null;
      } else if (result.error) {
        setStatusMessage(`Popup error: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 3000);
        return null;
      }
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
    return null;
  };

  const launchHooksPopup = async () => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'hooksPopup.js');

      // Get hooks data
      const { hasHook } = await import('./utils/hooks.js');
      const allHookTypes = [
        'before_pane_create',
        'pane_created',
        'worktree_created',
        'before_pane_close',
        'pane_closed',
        'before_worktree_remove',
        'worktree_removed',
        'pre_merge',
        'post_merge',
        'run_test',
        'run_dev',
      ];

      const hooks = allHookTypes.map(hookName => ({
        name: hookName,
        active: hasHook(projectRoot || process.cwd(), hookName as any)
      }));

      const hooksJson = JSON.stringify(hooks);

      // Launch the popup - position at top, 1 char right of sidebar
      // Height calculation: title(2) + hooks(11) + actions box(8) + help(2) + padding(3) = 26
      const result = await launchNodePopup<{
        action?: 'edit' | 'view';
      }>(
        popupScriptPath,
        [hooksJson],
        {
          width: 70,
          height: 26,
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      if (result.success && result.data?.action === 'edit') {
        // Edit hooks using an agent
        const prompt = "I would like to edit my dmux hooks in .dmux-hooks, please read the instructions in there and ask me what I want to edit";

        // Choose agent
        const agents = availableAgents;
        if (agents.length === 0) {
          await createNewPaneHook(prompt);
        } else if (agents.length === 1) {
          await createNewPaneHook(prompt, agents[0]);
        } else {
          // Multiple agents available - check for default agent setting first
          const settings = settingsManager.getSettings();
          if (settings.defaultAgent && agents.includes(settings.defaultAgent)) {
            // Use the default agent from settings
            await createNewPaneHook(prompt, settings.defaultAgent);
          } else {
            // No default agent configured or default not available - show agent choice popup
            const selectedAgent = await launchAgentChoicePopup(prompt);
            if (selectedAgent) {
              await createNewPaneHook(prompt, selectedAgent);
            }
          }
        }
      } else if (result.success && result.data?.action === 'view') {
        // View hooks file in editor - could implement this later
        setStatusMessage('View in editor not yet implemented');
        setTimeout(() => setStatusMessage(''), 2000);
      } else if (result.cancelled) {
        // User pressed ESC - do nothing
        return;
      } else if (result.error) {
        setStatusMessage(`Popup error: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 3000);
      }
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const launchLogsPopup = async () => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'logsPopup.js');

      // Launch the popup - position at top, 1 char right of sidebar
      const result = await launchNodePopup<void>(
        popupScriptPath,
        [],
        {
          width: 70,
          height: 25,
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      // Popup closed (user pressed ESC or finished viewing)
      // Logs are automatically marked as read when popup opens
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const launchSettingsPopup = async () => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'settingsPopup.js');

      // Prepare settings data for popup
      const settingsData = {
        settingDefinitions: SETTING_DEFINITIONS,
        settings: settingsManager.getSettings(),
        globalSettings: settingsManager.getGlobalSettings(),
        projectSettings: settingsManager.getProjectSettings(),
      };
      const settingsJson = JSON.stringify(settingsData);

      // Launch the popup - position at top, 1 char right of sidebar
      const result = await launchNodePopup<any>(
        popupScriptPath,
        [settingsJson],
        {
          width: 70,
          height: Math.min(25, SETTING_DEFINITIONS.length + 8),
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      if (result.success) {
        // Check if this is an action result (action field at top level)
        if ((result as any).action) {
          // Action type setting (like 'hooks')
          if ((result as any).action === 'hooks') {
            // Launch hooks popup
            await launchHooksPopup();
          }
        } else if (result.data) {
          // Regular setting change (result.data contains the setting)
          const { key, value, scope } = result.data as { key: string; value: any; scope: 'global' | 'project' };
          settingsManager.updateSetting(key as keyof import('./types.js').DmuxSettings, value, scope);
          setStatusMessage(`Setting saved (${scope})`);
          setTimeout(() => setStatusMessage(''), 2000);
        }
      } else if (result.cancelled) {
        // User pressed ESC - do nothing
        return;
      } else if (result.error) {
        setStatusMessage(`Popup error: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 3000);
      }
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const launchChoicePopup = async (title: string, message: string, options: Array<{id: string, label: string, description?: string, danger?: boolean, default?: boolean}>): Promise<string | null> => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return null;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'choicePopup.js');

      // Write data to temp file to avoid shell escaping issues
      const dataFile = `/tmp/dmux-choice-${Date.now()}.json`;
      const dataJson = JSON.stringify({ title, message, options });
      await fs.writeFile(dataFile, dataJson);

      // Launch the popup - position at top, 1 char right of sidebar
      const result = await launchNodePopup<string>(
        popupScriptPath,
        [dataFile],
        {
          width: 70,
          height: Math.min(25, options.length * 3 + 8),
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      // Clean up temp file
      try {
        await fs.unlink(dataFile);
      } catch {}

      if (result.success && result.data) {
        return result.data;
      } else if (result.cancelled) {
        return null;
      } else if (result.error) {
        setStatusMessage(`Popup error: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 3000);
        return null;
      }
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
    return null;
  };

  const launchInputPopup = async (title: string, message: string, placeholder?: string, defaultValue?: string): Promise<string | null> => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage('Popups require tmux 3.2+');
      setTimeout(() => setStatusMessage(''), 3000);
      return null;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'inputPopup.js');

      // Write data to temp file to avoid shell escaping issues
      const dataFile = `/tmp/dmux-input-${Date.now()}.json`;
      const dataJson = JSON.stringify({ title, message, placeholder, defaultValue });
      await fs.writeFile(dataFile, dataJson);

      // Launch the popup - position at top, 1 char right of sidebar
      const result = await launchNodePopup<string>(
        popupScriptPath,
        [dataFile],
        {
          width: 70,
          height: 15,
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      // Clean up temp file
      try {
        await fs.unlink(dataFile);
      } catch {}

      if (result.success && result.data !== undefined) {
        return result.data;
      } else if (result.cancelled) {
        return null;
      } else if (result.error) {
        setStatusMessage(`Popup error: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 3000);
        return null;
      }
    } catch (error: any) {
      setStatusMessage(`Failed to launch popup: ${error.message}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
    return null;
  };

  const launchProgressPopup = async (message: string, type: 'info' | 'success' | 'error' = 'info', timeout: number = 2000): Promise<void> => {
    // Only launch popup if tmux supports it
    if (!popupsSupported) {
      setStatusMessage(message);
      setTimeout(() => setStatusMessage(''), timeout);
      return;
    }

    try {
      // Resolve the popup script path
      const projectRootForPopup = __dirname.includes('/dist')
        ? path.resolve(__dirname, '..') // If in dist/, go up one level
        : path.resolve(__dirname, '..'); // If in src/, go up one level

      const popupScriptPath = path.join(projectRootForPopup, 'dist', 'popups', 'progressPopup.js');

      // Write data to temp file to avoid shell escaping issues
      const dataFile = `/tmp/dmux-progress-${Date.now()}.json`;
      const dataJson = JSON.stringify({ message, type, timeout });
      await fs.writeFile(dataFile, dataJson);

      // Launch the popup - position at top, 1 char right of sidebar
      // Height depends on message length
      const lines = Math.ceil(message.length / 60) + 3; // Estimate lines needed
      await launchNodePopup<void>(
        popupScriptPath,
        [dataFile],
        {
          width: 70,
          height: Math.min(15, lines + 4),
          centered: false,
          leftOffset: SIDEBAR_WIDTH + 1,
          topOffset: 0
        }
      );

      // Clean up temp file
      try {
        await fs.unlink(dataFile);
      } catch {}
    } catch (error: any) {
      // Fallback to inline message
      setStatusMessage(message);
      setTimeout(() => setStatusMessage(''), timeout);
    }
  };

  // Action system - initialized after popup launchers are defined
  const actionSystem = useActionSystem({
    panes,
    savePanes,
    sessionName,
    projectName,
    onPaneRemove: (paneId) => {
      // Mark the pane as intentionally closed to prevent race condition with worker
      intentionallyClosedPanes.current.add(paneId);

      // Remove from panes list
      const updatedPanes = panes.filter(p => p.paneId !== paneId);
      savePanes(updatedPanes);

      // Clean up after a delay
      setTimeout(() => {
        intentionallyClosedPanes.current.delete(paneId);
      }, 5000);
    },
    forceRepaint,
    popupLaunchers: popupsSupported ? {
      launchConfirmPopup,
      launchChoicePopup,
      launchInputPopup,
      launchProgressPopup,
    } : undefined,
  });

  // Auto-show new pane dialog when starting with no panes
  useEffect(() => {
    // Only show the dialog if:
    // 1. Initial load is complete (!isLoading)
    // 2. We have no panes
    // 3. We're not already showing the dialog
    // 4. We're not showing any other dialogs or prompts
    if (!isLoading &&
        panes.length === 0 &&
        !showNewPaneDialog &&
        !actionSystem.actionState.showConfirmDialog &&
        !actionSystem.actionState.showChoiceDialog &&
        !actionSystem.actionState.showInputDialog &&
        !actionSystem.actionState.showProgressDialog &&
        !showCommandPrompt &&
        !showFileCopyPrompt &&
        !isCreatingPane &&
        !runningCommand &&
        !isUpdating) {
      setShowNewPaneDialog(true);
    }
  }, [isLoading, panes.length, showNewPaneDialog, actionSystem.actionState.showConfirmDialog, actionSystem.actionState.showChoiceDialog, actionSystem.actionState.showInputDialog, actionSystem.actionState.showProgressDialog, showCommandPrompt, showFileCopyPrompt, isCreatingPane, runningCommand, isUpdating]);

  // Periodic enforcement of control pane size and content pane rebalancing (left sidebar at 40 chars)
  useEffect(() => {
    if (!controlPaneId) {
      return; // No sidebar layout configured
    }

    // Enforce sidebar width immediately on mount
    enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);

    // Debounce resize handler to prevent infinite loops
    let resizeTimeout: NodeJS.Timeout | null = null;
    let isApplyingLayout = false;

    const handleResize = () => {
      // Skip if we're already applying a layout (prevents loops)
      if (isApplyingLayout) {
        return;
      }

      // Clear any pending resize
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      // Debounce: wait 200ms after last resize event
      resizeTimeout = setTimeout(() => {
        // Only enforce if not showing dialogs (to avoid interference)
        const hasActiveDialog = showNewPaneDialog ||
          actionSystem.actionState.showConfirmDialog ||
          actionSystem.actionState.showChoiceDialog ||
          actionSystem.actionState.showInputDialog ||
          actionSystem.actionState.showProgressDialog ||
          !!showCommandPrompt ||
          showFileCopyPrompt ||
          isCreatingPane ||
          runningCommand ||
          isUpdating;

        if (!hasActiveDialog) {
          isApplyingLayout = true;
          // Only enforce sidebar width when terminal resizes
          enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);

          // Force Ink to repaint after resize to prevent blank dmux pane
          forceRepaint();

          // Reset flag after a brief delay
          setTimeout(() => {
            isApplyingLayout = false;
          }, 100);
        }
      }, 200);
    };

    // Listen to stdout resize events
    process.stdout.on('resize', handleResize);

    return () => {
      process.stdout.off('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [controlPaneId, showNewPaneDialog, actionSystem.actionState.showConfirmDialog, actionSystem.actionState.showChoiceDialog, actionSystem.actionState.showInputDialog, actionSystem.actionState.showProgressDialog, showCommandPrompt, showFileCopyPrompt, isCreatingPane, runningCommand, isUpdating]);

  // Monitor agent status across panes (returns a map of pane ID to status)
  const agentStatuses = useAgentStatus({
    panes,
    suspend: showNewPaneDialog || actionSystem.actionState.showConfirmDialog || actionSystem.actionState.showChoiceDialog || actionSystem.actionState.showInputDialog || actionSystem.actionState.showProgressDialog || !!showCommandPrompt || showFileCopyPrompt,
    onPaneRemoved: (paneId: string) => {
      // Check if this pane was intentionally closed
      // If so, don't re-save - the close action already handled it
      if (intentionallyClosedPanes.current.has(paneId)) {
        return;
      }

      // Pane was removed unexpectedly (e.g., user killed tmux pane manually)
      // Remove it from our tracking
      const updatedPanes = panes.filter(p => p.id !== paneId);
      savePanes(updatedPanes);
    },
  });

  const createNewPane = async (prompt: string, agent?: 'claude' | 'opencode') => {
    setIsCreatingPane(true);
    setStatusMessage('Generating slug...');
    
    const slug = await generateSlug(prompt);
    
    setStatusMessage(`Creating worktree: ${slug}...`);
    
    // Get git root directory for consistent worktree placement
    let projectRoot: string;
    try {
      projectRoot = execSync('git rev-parse --show-toplevel', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
    } catch {
      // Fallback to current directory if not in a git repo
      projectRoot = process.cwd();
    }
    
    // Create worktree path inside .dmux/worktrees directory
    const worktreePath = path.join(projectRoot, '.dmux', 'worktrees', slug);
    
    // Get the original pane ID (where dmux is running) before clearing
    const originalPaneId = execSync('tmux display-message -p "#{pane_id}"', { encoding: 'utf-8' }).trim();
    
    // Multiple clearing strategies to prevent artifacts
    // 1. Clear screen with ANSI codes
    process.stdout.write('\x1b[2J\x1b[H');
    
    // 2. Fill with blank lines to push content off screen
    process.stdout.write('\n'.repeat(100));
    
    // 3. Clear tmux history and send clear command
    try {
      execSync('tmux clear-history', { stdio: 'pipe' });
      execSync('tmux send-keys C-l', { stdio: 'pipe' });
    } catch {}
    
    // Wait a bit for clearing to settle
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 4. Force tmux to refresh the display
    try {
      execSync('tmux refresh-client', { stdio: 'pipe' });
    } catch {}
    
    // Get current pane count to determine layout
    const paneCount = parseInt(
      execSync('tmux list-panes | wc -l', { encoding: 'utf-8' }).trim()
    );
    
    // Enable pane borders to show titles
    try {
      execSync(`tmux set-option -g pane-border-status top`, { stdio: 'pipe' });
    } catch {
      // Ignore if already set or fails
    }
    
    // Create new pane
    const paneInfo = execSync(
      `tmux split-window -h -P -F '#{pane_id}'`,
      { encoding: 'utf-8' }
    ).trim();
    
    // Wait for pane creation to settle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Set pane title to match the slug
    try {
      execSync(`tmux select-pane -t '${paneInfo}' -T "${slug}"`, { stdio: 'pipe' });
    } catch {
      // Ignore if setting title fails
    }
    
    // Don't apply global layouts - let content panes arrange naturally
    // Only enforce sidebar width
    try {
      const controlPaneId = execSync('tmux display-message -p "#{pane_id}"', { encoding: 'utf-8' }).trim();
      enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);
    } catch {}
    
    // Create git worktree and cd into it
    // This MUST happen before launching Claude to ensure we're in the right directory
    try {
      // First, create the worktree and cd into it as a single command
      // Use ; instead of && to ensure cd runs even if worktree already exists
      const worktreeCmd = `git worktree add "${worktreePath}" -b ${slug} 2>/dev/null ; cd "${worktreePath}"`;
      execSync(`tmux send-keys -t '${paneInfo}' '${worktreeCmd}' Enter`, { stdio: 'pipe' });
      
      // Wait longer for worktree creation and cd to complete
      // This is critical - if we don't wait long enough, Claude will start in the wrong directory
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Verify we're in the worktree directory by sending pwd command  
      execSync(`tmux send-keys -t '${paneInfo}' 'echo "Worktree created at:" && pwd' Enter`, { stdio: 'pipe' });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setStatusMessage(agent ? `Worktree created, launching ${agent === 'opencode' ? 'opencode' : 'Claude'}...` : 'Worktree created.');
    } catch (error) {
      // Log error but continue - worktree creation is essential
      setStatusMessage(`Warning: Worktree issue: ${error}`);
      // Even if worktree creation failed, try to cd to the directory in case it exists
      execSync(`tmux send-keys -t '${paneInfo}' 'cd "${worktreePath}" 2>/dev/null || (echo "ERROR: Failed to create/enter worktree ${slug}" && pwd)' Enter`, { stdio: 'pipe' });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Prepare and send the agent command
    let escapedCmd = '';
    if (agent === 'claude') {
      // Claude should always be launched AFTER we're in the worktree directory
      let claudeCmd: string;
      if (prompt && prompt.trim()) {
        const escapedPrompt = prompt
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/`/g, '\\`')
          .replace(/\$/g, '\\$');
        claudeCmd = `claude "${escapedPrompt}" --permission-mode=acceptEdits`;
      } else {
        claudeCmd = `claude --permission-mode=acceptEdits`;
      }
      // Send Claude command to new pane
      escapedCmd = claudeCmd.replace(/'/g, "'\\''");
      execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
    } else if (agent === 'opencode') {
      // opencode: start the TUI, then paste the prompt and submit
      const openCoderCmd = `opencode`;
      const escapedOpenCmd = openCoderCmd.replace(/'/g, "'\\''");
      execSync(`tmux send-keys -t '${paneInfo}' '${escapedOpenCmd}'`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
      if (prompt && prompt.trim()) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const bufName = `dmux_prompt_${Date.now()}`;
        const promptEsc = prompt.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
        execSync(`tmux set-buffer -b '${bufName}' -- '${promptEsc}'`, { stdio: 'pipe' });
        execSync(`tmux paste-buffer -b '${bufName}' -t '${paneInfo}'`, { stdio: 'pipe' });
        await new Promise(resolve => setTimeout(resolve, 200));
        execSync(`tmux delete-buffer -b '${bufName}'`, { stdio: 'pipe' });
        execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
      }
    }
    
    if (agent === 'claude') {
      // Monitor for Claude Code trust prompt and auto-respond
    const autoApproveTrust = async () => {
      // Wait for Claude to start up before checking for prompts
      await new Promise(resolve => setTimeout(resolve, 800));

      const maxChecks = 100; // 100 checks * 100ms = 10 seconds total
      const checkInterval = 100; // Check every 100ms
      let lastContent = '';
      let stableContentCount = 0;
      let promptHandled = false;
      
      // More comprehensive trust prompt patterns
      const trustPromptPatterns = [
        /Do you trust the files in this folder\?/i,
        /Trust the files in this workspace\?/i,
        /Do you trust the authors of the files/i,
        /Do you want to trust this workspace\?/i,
        /trust.*files.*folder/i,
        /trust.*workspace/i,
        /Do you trust/i,
        /Trust this folder/i,
        /trust.*directory/i,
        /permission.*grant/i,
        /allow.*access/i,
        /workspace.*trust/i,
        /accept.*edits/i,  // Claude's accept edits prompt
        /permission.*mode/i,  // Permission mode prompt
        /allow.*claude/i,  // Allow Claude prompt
        /\[y\/n\]/i, // Common yes/no prompt pattern
        /\(y\/n\)/i,
        /Yes\/No/i,
        /\[Y\/n\]/i,  // Default yes pattern
        /press.*enter.*accept/i,  // Press enter to accept
        /press.*enter.*continue/i,  // Press enter to continue
        /❯\s*1\.\s*Yes,\s*proceed/i,  // New Claude numbered menu format
        /Enter to confirm.*Esc to exit/i,  // New Claude confirmation format
        /1\.\s*Yes,\s*proceed/i,  // Yes proceed option
        /2\.\s*No,\s*exit/i  // No exit option
      ];
      
      for (let i = 0; i < maxChecks; i++) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));

        try {
          // Capture the pane content
          const paneContent = capturePaneContent(paneInfo, 30);

          if (i % 10 === 0) {  // Log every 10 checks (every second)
          }
          
          // Check if content has stabilized (same for 3 checks = prompt is waiting)
          if (paneContent === lastContent) {
            stableContentCount++;
          } else {
            stableContentCount = 0;
            lastContent = paneContent;
          }
          
          // Look for trust prompt in the current content
          const hasTrustPrompt = trustPromptPatterns.some(pattern => 
            pattern.test(paneContent)
          );
          
          // Also check if we see specific Claude permission text
          const hasClaudePermissionPrompt = 
            paneContent.includes('Do you trust') ||
            paneContent.includes('trust the files') ||
            paneContent.includes('permission') ||
            paneContent.includes('allow') ||
            (paneContent.includes('folder') && paneContent.includes('?'));
          
          if ((hasTrustPrompt || hasClaudePermissionPrompt) && !promptHandled) {

            // Content is stable and we found a prompt
            if (stableContentCount >= 2) {

              // Check if this is the new Claude numbered menu format
              const isNewClaudeFormat = /❯\s*1\.\s*Yes,\s*proceed/i.test(paneContent) ||
                                      /Enter to confirm.*Esc to exit/i.test(paneContent);

              if (isNewClaudeFormat) {
                // For new Claude format, just press Enter to confirm default "Yes, proceed"
                execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
              } else {
                // Try multiple response methods for older formats

                // Method 1: Send 'y' followed by Enter (most explicit)
                execSync(`tmux send-keys -t '${paneInfo}' 'y'`, { stdio: 'pipe' });
                await new Promise(resolve => setTimeout(resolve, 50));
                execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });

                // Method 2: Just Enter (if it's a yes/no with default yes)
                await new Promise(resolve => setTimeout(resolve, 100));
                execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
              }
              
              // Mark as handled to avoid duplicate responses
              promptHandled = true;
              
              // Wait and check if prompt is gone
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Verify the prompt is gone
              const updatedContent = capturePaneContent(paneInfo, 10);
              
              // If trust prompt is gone, check if we need to resend the Claude command
              const promptGone = !trustPromptPatterns.some(p => p.test(updatedContent));
              
              if (promptGone) {
                // Check if Claude is running or if we need to restart it
                const claudeRunning =
                  updatedContent.includes('Claude') ||
                  updatedContent.includes('claude') ||
                  updatedContent.includes('Assistant') ||
                  (prompt && updatedContent.includes(prompt.substring(0, Math.min(20, prompt.length))));


                if (!claudeRunning && !updatedContent.includes('$')) {
                  await new Promise(resolve => setTimeout(resolve, 300));
                  execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, { stdio: 'pipe' });
                  execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
                }

                break;
              }
            }
          }
          
          // If we see Claude is already running without prompts, we're done
          if (!hasTrustPrompt && !hasClaudePermissionPrompt && 
              (paneContent.includes('Claude') || paneContent.includes('Assistant'))) {
            break;
          }
        } catch (error) {
          // Continue checking, errors are non-fatal
        }
      }
    };
    
    // Start monitoring for trust prompt in background
    autoApproveTrust().catch(err => {
    });
    }
    
    // Keep focus on the new pane
    execSync(`tmux select-pane -t '${paneInfo}'`, { stdio: 'pipe' });
    
    // Save pane info
    const newPane: DmuxPane = {
      id: `dmux-${Date.now()}`,
      slug,
      prompt: prompt || 'No initial prompt',
      paneId: paneInfo,
      worktreePath,
      agent
    };
    
    const updatedPanes = [...panes, newPane];
    await savePanes(updatedPanes);
    
    // Switch back to the original pane (where dmux is running)
    execSync(`tmux select-pane -t '${originalPaneId}'`, { stdio: 'pipe' });
    
    // Re-set the title for the dmux pane
    try {
      execSync(`tmux select-pane -t '${originalPaneId}' -T "dmux-${projectName}"`, { stdio: 'pipe' });
    } catch {
      // Ignore if setting title fails
    }
    
    // Clear the screen and redraw the UI
    process.stdout.write('\x1b[2J\x1b[H');
    
    // Reset the creating pane flag and refresh
    setIsCreatingPane(false);
    setStatusMessage('');
    setNewPanePrompt('');
    
    // Force a reload of panes to ensure UI is up to date
    await loadPanes();
  };

  const jumpToPane = (paneId: string) => {
    try {
      // Enable pane borders to show titles (if not already enabled)
      try {
        execSync(`tmux set-option -g pane-border-status top`, { stdio: 'pipe' });
      } catch {
        // Ignore if already set or fails
      }

      execSync(`tmux select-pane -t '${paneId}'`, { stdio: 'pipe' });

      // Clear screen after jump to remove artifacts
      clearScreen();

      setStatusMessage('Jumped to pane');
      setTimeout(() => setStatusMessage(''), 2000);
    } catch {
      setStatusMessage('Failed to jump - pane may be closed');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };









  const runCommand = async (type: 'test' | 'dev', pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree path for this pane');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    const command = type === 'test' ? projectSettings.testCommand : projectSettings.devCommand;
    const isFirstRun = type === 'test' ? !projectSettings.firstTestRun : !projectSettings.firstDevRun;
    
    if (!command) {
      // No command configured, prompt user
      setShowCommandPrompt(type);
      return;
    }
    
    // Check if this is the first run and offer to copy non-git files
    if (isFirstRun) {
      // Show file copy prompt and wait for response
      setShowFileCopyPrompt(true);
      setCurrentCommandType(type);
      setStatusMessage(`First time running ${type} command...`);
      
      // Return here - the actual command will be run after user responds to prompt
      return;
    }

    try {
      setRunningCommand(true);
      setStatusMessage(`Starting ${type} in background window...`);
      
      // Kill existing window if present
      const existingWindowId = type === 'test' ? pane.testWindowId : pane.devWindowId;
      if (existingWindowId) {
        try {
          execSync(`tmux kill-window -t '${existingWindowId}'`, { stdio: 'pipe' });
        } catch {}
      }
      
      // Create a new background window for the command
      const windowName = `${pane.slug}-${type}`;
      const windowId = execSync(
        `tmux new-window -d -n '${windowName}' -P -F '#{window_id}'`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      
      // Create a log file to capture output
      const logFile = `/tmp/dmux-${pane.id}-${type}.log`;
      
      // Build the command with output capture
      const fullCommand = type === 'test'
        ? `cd "${pane.worktreePath}" && ${command} 2>&1 | tee ${logFile}`
        : `cd "${pane.worktreePath}" && ${command} 2>&1 | tee ${logFile}`;
      
      // Send the command to the new window
      execSync(`tmux send-keys -t '${windowId}' '${fullCommand.replace(/'/g, "'\\''")}'`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${windowId}' Enter`, { stdio: 'pipe' });
      
      // Update pane with window info
      const updatedPane: DmuxPane = {
        ...pane,
        [type === 'test' ? 'testWindowId' : 'devWindowId']: windowId,
        [type === 'test' ? 'testStatus' : 'devStatus']: 'running'
      };
      
      const updatedPanes = panes.map(p => p.id === pane.id ? updatedPane : p);
      await savePanes(updatedPanes);
      
      // Start monitoring the output
      if (type === 'test') {
        // For tests, monitor for completion
        setTimeout(() => monitorTestOutput(pane.id, logFile), 2000);
      } else {
        // For dev, monitor for server URL
        setTimeout(() => monitorDevOutput(pane.id, logFile), 2000);
      }
      
      setRunningCommand(false);
      setStatusMessage(`${type === 'test' ? 'Test' : 'Dev server'} started in background`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setRunningCommand(false);
      setStatusMessage(`Failed to run ${type} command`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };
  



  // Update handling moved to useAutoUpdater

  // Helper function to clear screen artifacts
  const clearScreen = () => {
    // CRITICAL: Force Ink to re-render FIRST, before clearing
    // This prevents blank screen by ensuring React starts rendering immediately
    setForceRepaintTrigger(prev => prev + 1);

    // Multiple clearing strategies to prevent artifacts
    // 1. Clear screen with ANSI codes
    process.stdout.write('\x1b[2J\x1b[H');

    // 2. Clear tmux history
    try {
      execSync('tmux clear-history', { stdio: 'pipe' });
    } catch {}

    // 3. Force tmux to refresh the display
    try {
      execSync('tmux refresh-client', { stdio: 'pipe' });
    } catch {}
  };

  // Cleanup function for exit
  const cleanExit = () => {
    // Clear screen before exiting Ink
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

    // Exit the Ink app (this cleans up the React tree)
    exit();

    // Give Ink a moment to clean up its rendering, then do final cleanup
    setTimeout(() => {
      // Multiple aggressive clearing strategies
      process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and move cursor to home
      process.stdout.write('\x1b[3J'); // Clear scrollback buffer
      process.stdout.write('\x1b[0m'); // Reset all attributes

      // Clear tmux history and pane
      try {
        execSync('tmux clear-history', { stdio: 'pipe' });
        execSync('tmux send-keys C-l', { stdio: 'pipe' });
      } catch {}

      // One more final clear
      process.stdout.write('\x1b[2J\x1b[H');

      // Show clean goodbye message
      process.stdout.write('\n  Run dmux again to resume. Goodbye 👋\n\n');

      // Exit process
      process.exit(0);
    }, 100);
  };

  useInput(async (input: string, key: any) => {
    // Handle Ctrl+C for quit confirmation (must be first, before any other checks)
    if (key.ctrl && input === 'c') {
      if (quitConfirmMode) {
        // Second Ctrl+C - actually quit
        cleanExit();
      } else {
        // First Ctrl+C - show confirmation
        setQuitConfirmMode(true);
        // Reset after 3 seconds if user doesn't press Ctrl+C again
        setTimeout(() => {
          setQuitConfirmMode(false);
        }, 3000);
      }
      return;
    }

    if (isCreatingPane || runningCommand || isUpdating || isLoading || isCreatingTunnel) {
      // Disable input while performing operations or loading
      return;
    }

    // Handle quit confirm mode - ESC cancels it
    if (quitConfirmMode) {
      if (key.escape) {
        setQuitConfirmMode(false);
        return;
      }
      // Allow other inputs to continue (don't return early)
    }

    // Handle QR code view
    if (showQRCode) {
      if (key.escape) {
        setShowQRCode(false);
      }
      return;
    }


    if (showFileCopyPrompt) {
      if (input === 'y' || input === 'Y') {
        setShowFileCopyPrompt(false);
        const selectedPane = panes[selectedIndex];
        if (selectedPane && selectedPane.worktreePath && currentCommandType) {
          await copyNonGitFiles(selectedPane.worktreePath);
          
          // Mark as not first run and continue with command
          const newSettings = {
            ...projectSettings,
            [currentCommandType === 'test' ? 'firstTestRun' : 'firstDevRun']: true
          };
          await saveSettings(newSettings);
          
          // Now run the actual command
          await runCommandInternal(currentCommandType, selectedPane);
        }
        setCurrentCommandType(null);
      } else if (input === 'n' || input === 'N' || key.escape) {
        setShowFileCopyPrompt(false);
        const selectedPane = panes[selectedIndex];
        if (selectedPane && currentCommandType) {
          // Mark as not first run and continue without copying
          const newSettings = {
            ...projectSettings,
            [currentCommandType === 'test' ? 'firstTestRun' : 'firstDevRun']: true
          };
          await saveSettings(newSettings);
          
          // Now run the actual command
          await runCommandInternal(currentCommandType, selectedPane);
        }
        setCurrentCommandType(null);
    }
     return;
   }
   
   if (showCommandPrompt) {
      if (key.escape) {
        setShowCommandPrompt(null);
        setCommandInput('');
      } else if (key.return) {
        if (commandInput.trim() === '') {
          // If empty, suggest a default command based on package manager
          const suggested = await suggestCommand(showCommandPrompt);
          if (suggested) {
            setCommandInput(suggested);
          }
        } else {
          // User provided manual command
          const newSettings = {
            ...projectSettings,
            [showCommandPrompt === 'test' ? 'testCommand' : 'devCommand']: commandInput.trim()
          };
          await saveSettings(newSettings);
          const selectedPane = panes[selectedIndex];
          if (selectedPane) {
            // Check if first run
            const isFirstRun = showCommandPrompt === 'test' ? !projectSettings.firstTestRun : !projectSettings.firstDevRun;
            if (isFirstRun) {
              setCurrentCommandType(showCommandPrompt);
              setShowCommandPrompt(null);
              setShowFileCopyPrompt(true);
            } else {
              await runCommandInternal(showCommandPrompt, selectedPane);
              setShowCommandPrompt(null);
              setCommandInput('');
            }
          } else {
            setShowCommandPrompt(null);
            setCommandInput('');
          }
        }
      }
      return;
    }
    
    if (showNewPaneDialog) {
      if (key.escape) {
        setShowNewPaneDialog(false);
        setNewPanePrompt('');
      }
      // TextInput handles other input events
      return;
    }

    // Handle directional navigation with spatial awareness based on card grid layout
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      let targetIndex: number | null = null;
      
      if (key.upArrow) {
        targetIndex = findCardInDirection(selectedIndex, 'up');
      } else if (key.downArrow) {
        targetIndex = findCardInDirection(selectedIndex, 'down');
      } else if (key.leftArrow) {
        targetIndex = findCardInDirection(selectedIndex, 'left');
      } else if (key.rightArrow) {
        targetIndex = findCardInDirection(selectedIndex, 'right');
      }
      
      if (targetIndex !== null) {
        setSelectedIndex(targetIndex);
      }
      return;
    }
    
    if (input === 'm' && selectedIndex < panes.length) {
      // Open kebab menu popup for selected pane
      await launchKebabMenuPopup(selectedIndex);
    } else if (input === 's') {
      // Open settings popup
      await launchSettingsPopup();
    } else if (input === 'l') {
      // Open logs popup
      await launchLogsPopup();
    } else if (input === 'L' && controlPaneId) {
      // Reset layout to sidebar configuration (Shift+L)
      enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);
      setStatusMessage('Layout reset');
      setTimeout(() => setStatusMessage(''), 2000);
    } else if (input === 'q') {
      cleanExit();
    } else if (input === 'r' && server) {
      // Create tunnel if not already created, then show QR code
      if (!tunnelUrl) {
        setIsCreatingTunnel(true);
        setStatusMessage('Creating tunnel...');
        try {
          const url = await server.startTunnel();
          setTunnelUrl(url);
          setStatusMessage('');
          setShowQRCode(true);
        } catch (error) {
          setStatusMessage('Failed to create tunnel');
          setTimeout(() => setStatusMessage(''), 3000);
        } finally {
          setIsCreatingTunnel(false);
        }
      } else {
        // Tunnel already exists, just show the QR code
        setShowQRCode(true);
      }
    } else if (!isLoading && (input === 'n' || (key.return && selectedIndex === panes.length))) {
      // Launch popup modal for new pane
      await launchNewPanePopup();
      return;
    } else if (input === 'j' && selectedIndex < panes.length) {
      // Jump to pane (NEW: using action system)
      StateManager.getInstance().setDebugMessage(`Jumping to pane: ${panes[selectedIndex].slug}`);
      setTimeout(() => StateManager.getInstance().setDebugMessage(''), 2000);
      actionSystem.executeAction(PaneAction.VIEW, panes[selectedIndex]);
    } else if (input === 'x' && selectedIndex < panes.length) {
      // Close pane (NEW: using action system)
      StateManager.getInstance().setDebugMessage(`Closing pane: ${panes[selectedIndex].slug}`);
      setTimeout(() => StateManager.getInstance().setDebugMessage(''), 2000);
      actionSystem.executeAction(PaneAction.CLOSE, panes[selectedIndex]);
    } else if (key.return && selectedIndex < panes.length) {
      // Jump to pane (NEW: using action system)
      StateManager.getInstance().setDebugMessage(`Jumping to pane: ${panes[selectedIndex].slug}`);
      setTimeout(() => StateManager.getInstance().setDebugMessage(''), 2000);
      actionSystem.executeAction(PaneAction.VIEW, panes[selectedIndex]);
    }
  });

  // If showing QR code, render only that
  if (showQRCode && tunnelUrl) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            dmux - Remote Access
          </Text>
        </Box>
        <QRCode url={tunnelUrl} />
        <Box marginTop={1}>
          <Text dimColor>Press ESC to return to pane list</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* CRITICAL: Hidden spinner that forces re-render when shown */}
      {showRepaintSpinner && (
        <Box marginTop={-10} marginLeft={-100}>
          <Text>⟳</Text>
        </Box>
      )}

      <PanesGrid
        panes={panes}
        selectedIndex={selectedIndex}
        isLoading={isLoading}
        showNewPaneDialog={showNewPaneDialog}
        agentStatuses={agentStatuses}
      />

      {/* Loading dialog */}
      {isLoading && (<LoadingIndicator />)}

      {showNewPaneDialog && (
        <NewPaneDialog
          value={newPanePrompt}
          onChange={setNewPanePrompt}
          onSubmit={async (value) => {
            const promptValue = value;
            const agents = availableAgents;
            setShowNewPaneDialog(false);
            setNewPanePrompt('');

            if (agents.length === 0) {
              await createNewPaneHook(promptValue);
            } else if (agents.length === 1) {
              await createNewPaneHook(promptValue, agents[0]);
            } else {
              // Multiple agents available - check for default agent setting first
              const settings = settingsManager.getSettings();
              if (settings.defaultAgent && agents.includes(settings.defaultAgent)) {
                // Use the default agent from settings
                await createNewPaneHook(promptValue, settings.defaultAgent);
              } else {
                // No default agent configured or default not available - show agent choice popup
                const selectedAgent = await launchAgentChoicePopup(promptValue);
                if (selectedAgent) {
                  await createNewPaneHook(promptValue, selectedAgent);
                }
              }
            }
          }}
        />
      )}

      {showCommandPrompt && (
        <CommandPromptDialog type={showCommandPrompt} value={commandInput} onChange={setCommandInput} />
      )}

      {showFileCopyPrompt && (
        <FileCopyPrompt />
      )}

      {runningCommand && (
        <RunningIndicator />
      )}

      {isUpdating && (
        <UpdatingIndicator />
      )}

      {isCreatingTunnel && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginTop={1}>
          <Text bold color="cyan">Creating tunnel...</Text>
          <Box marginTop={1}>
            <Text dimColor>This may take a few moments...</Text>
          </Box>
        </Box>
      )}

      {statusMessage && (
        <Box marginTop={1}>
          <Text color="green">{statusMessage}</Text>
        </Box>
      )}

      {/* Action system status messages */}
      {actionSystem.actionState.statusMessage && (
        <Box marginTop={1}>
          <Text color={
            actionSystem.actionState.statusType === 'error' ? 'red' :
            actionSystem.actionState.statusType === 'success' ? 'green' :
            'cyan'
          }>
            {actionSystem.actionState.statusMessage}
          </Text>
        </Box>
      )}

      <FooterHelp
        show={!showNewPaneDialog && !showCommandPrompt}
        showRemoteKey={!!server}
        quitConfirmMode={quitConfirmMode}
        hasSidebarLayout={!!controlPaneId}
        gridInfo={(() => {
          if (!process.env.DEBUG_DMUX) return undefined;
          const cols = Math.max(1, Math.floor(terminalWidth / 37));
          const rows = Math.ceil((panes.length + 1) / cols);
          const pos = getCardGridPosition(selectedIndex);
          return `Grid: ${cols} cols × ${rows} rows | Selected: row ${pos.row}, col ${pos.col} | Terminal: ${terminalWidth}w`;
        })()}
      />

      <Text dimColor>
        {updateAvailable && updateInfo && (
          <Text color="red" bold>Update available: npm i -g dmux@latest </Text>
        )}
        v{packageJson.version}
        <Text color="magenta" bold> • SIDEBAR-40COL-BUILD</Text>
        {serverPort && serverPort > 0 && (
          <Text dimColor> • <Text color="cyan">http://127.0.0.1:{serverPort}</Text></Text>
        )}
        {unreadErrorCount > 0 && (
          <Text> • <Text color="red" bold>🪵 Logs ({unreadErrorCount})</Text></Text>
        )}
        {debugMessage && (
          <Text dimColor> • {debugMessage}</Text>
        )}
      </Text>
    </Box>
  );
};

export default DmuxApp;