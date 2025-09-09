import type { DmuxPane, ProjectSettings } from '../types.js';
import usePaneRunner from './usePaneRunner.js';

interface Params {
  panes: DmuxPane[];
  savePanes: (p: DmuxPane[]) => Promise<void>;
  projectSettings: ProjectSettings;
  saveSettings: (s: ProjectSettings) => Promise<void>;
  setShowCommandPrompt: (v: 'test' | 'dev' | null) => void;
  setShowFileCopyPrompt: (v: boolean) => void;
  setCurrentCommandType: (v: 'test' | 'dev' | null) => void;
  setStatusMessage: (msg: string) => void;
  setRunningCommand: (v: boolean) => void;
}

export default function useCommandRunner({
  panes,
  savePanes,
  projectSettings,
  saveSettings,
  setShowCommandPrompt,
  setShowFileCopyPrompt,
  setCurrentCommandType,
  setStatusMessage,
  setRunningCommand,
}: Params) {
  const { runCommandInternal, copyNonGitFiles } = usePaneRunner({
    panes,
    savePanes,
    projectSettings,
    setStatusMessage,
    setRunningCommand,
  });

  const runCommand = async (type: 'test' | 'dev', pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree path for this pane');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    const command = type === 'test' ? projectSettings.testCommand : projectSettings.devCommand;
    const isFirstRun = type === 'test' ? !projectSettings.firstTestRun : !projectSettings.firstDevRun;

    if (!command) {
      setShowCommandPrompt(type);
      return;
    }

    if (isFirstRun) {
      setShowFileCopyPrompt(true);
      setCurrentCommandType(type);
      setStatusMessage(`First time running ${type} command...`);
      return;
    }

    await runCommandInternal(type, pane);
  };

  const handleFirstRunResponse = async (accepted: boolean, type: 'test' | 'dev', pane: DmuxPane) => {
    if (!pane.worktreePath) return;
    if (accepted) await copyNonGitFiles(pane.worktreePath);

    const newSettings: ProjectSettings = {
      ...projectSettings,
      [type === 'test' ? 'firstTestRun' : 'firstDevRun']: true,
    };
    await saveSettings(newSettings);

    await runCommandInternal(type, pane);
  };

  return { runCommand, handleFirstRunResponse } as const;
}
