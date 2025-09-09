import { execSync } from 'child_process';
import fs from 'fs/promises';
import type { DmuxPane, ProjectSettings } from '../types.js';
import { applySmartLayout } from '../utils/tmux.js';

interface Params {
  panes: DmuxPane[];
  savePanes: (p: DmuxPane[]) => Promise<void>;
  projectSettings: ProjectSettings;
  setStatusMessage: (msg: string) => void;
  setRunningCommand: (v: boolean) => void;
}

export default function usePaneRunner({ panes, savePanes, projectSettings, setStatusMessage, setRunningCommand }: Params) {
  const copyNonGitFiles = async (worktreePath: string) => {
    try {
      setStatusMessage('Copying non-git files from main...');
      const projectRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: 'pipe' }).trim();
      const rsyncCmd = `rsync -avz --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='build' --exclude='.next' --exclude='.turbo' "${projectRoot}/" "${worktreePath}/"`;
      execSync(rsyncCmd, { stdio: 'pipe' });
      setStatusMessage('Non-git files copied successfully');
      setTimeout(() => setStatusMessage(''), 2000);
    } catch {
      setStatusMessage('Failed to copy non-git files');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  const runCommandInternal = async (type: 'test' | 'dev', pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree path for this pane');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    const command = type === 'test' ? projectSettings.testCommand : projectSettings.devCommand;
    if (!command) {
      setStatusMessage('No command configured');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    try {
      setRunningCommand(true);
      setStatusMessage(`Starting ${type} in background window...`);

      const existingWindowId = type === 'test' ? pane.testWindowId : pane.devWindowId;
      if (existingWindowId) {
        try { execSync(`tmux kill-window -t '${existingWindowId}'`, { stdio: 'pipe' }); } catch {}
      }

      const windowName = `${pane.slug}-${type}`;
      const windowId = execSync(`tmux new-window -d -n '${windowName}' -P -F '#{window_id}'`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
      const logFile = `/tmp/dmux-${pane.id}-${type}.log`;
      const fullCommand = `cd "${pane.worktreePath}" && ${command} 2>&1 | tee ${logFile}`;
      execSync(`tmux send-keys -t '${windowId}' '${fullCommand.replace(/'/g, "'\\''")}' Enter`, { stdio: 'pipe' });

      const updatedPane: DmuxPane = {
        ...pane,
        [type === 'test' ? 'testWindowId' : 'devWindowId']: windowId,
        [type === 'test' ? 'testStatus' : 'devStatus']: 'running'
      } as DmuxPane;

      const updatedPanes = panes.map(p => p.id === pane.id ? updatedPane : p);
      await savePanes(updatedPanes);

      if (type === 'test') setTimeout(() => monitorTestOutput(pane.id, logFile), 2000);
      else setTimeout(() => monitorDevOutput(pane.id, logFile), 2000);

      setRunningCommand(false);
      setStatusMessage(`${type === 'test' ? 'Test' : 'Dev server'} started in background`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch {
      setRunningCommand(false);
      setStatusMessage(`Failed to run ${type} command`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const monitorTestOutput = async (paneId: string, logFile: string) => {
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      let status: 'passed' | 'failed' | 'running' = 'running';
      if (content.match(/(?:tests?|specs?) (?:passed|✓|succeeded)/i) || content.match(/\b0 fail(?:ing|ed|ures?)\b/i)) {
        status = 'passed';
      } else if (content.match(/(?:tests?|specs?) (?:failed|✗|✖)/i) || content.match(/\d+ fail(?:ing|ed|ures?)/i) || content.match(/error:/i)) {
        status = 'failed';
      }

      const pane = panes.find(p => p.id === paneId);
      if (pane?.testWindowId) {
        try {
          execSync(`tmux list-windows -F '#{window_id}' | rg -q '${pane.testWindowId}'`, { stdio: 'pipe' });
          const paneOutput = execSync(`tmux capture-pane -t '${pane.testWindowId}' -p | tail -5`, { encoding: 'utf-8' });
          if (paneOutput.includes('$') || paneOutput.includes('#')) {
            if (status === 'running') status = 'passed';
          }
        } catch {
          if (status === 'running') status = 'failed';
        }
      }

      const updatedPanes = panes.map(p => p.id === paneId ? { ...p, testStatus: status, testOutput: content.slice(-5000) } : p);
      await savePanes(updatedPanes);
      if (status === 'running') setTimeout(() => monitorTestOutput(paneId, logFile), 2000);
    } catch {}
  };

  const monitorDevOutput = async (paneId: string, logFile: string) => {
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const urlMatch = content.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/i) || content.match(/Local:\s+(https?:\/\/[^\s]+)/i) || content.match(/listening on port (\d+)/i);
      let devUrl = '';
      if (urlMatch) {
        if (urlMatch[0].startsWith('http')) devUrl = urlMatch[0];
        else if ((urlMatch as any)[1]) devUrl = `http://localhost:${(urlMatch as any)[1]}`;
      }
      const pane = panes.find(p => p.id === paneId);
      let status: 'running' | 'stopped' = 'running';
      if (pane?.devWindowId) {
        try { execSync(`tmux list-windows -F '#{window_id}' | rg -q '${pane.devWindowId}'`, { stdio: 'pipe' }); } catch { status = 'stopped'; }
      }
      const updatedPanes = panes.map(p => p.id === paneId ? { ...p, devStatus: status, devUrl: devUrl || p.devUrl } : p);
      await savePanes(updatedPanes);
      if (status === 'running') setTimeout(() => monitorDevOutput(paneId, logFile), 2000);
    } catch {}
  };

  const attachBackgroundWindow = async (pane: DmuxPane, type: 'test' | 'dev') => {
    const windowId = type === 'test' ? pane.testWindowId : pane.devWindowId;
    if (!windowId) {
      setStatusMessage(`No ${type} window to attach`);
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }
    try {
      execSync(`tmux join-pane -h -s '${windowId}'`, { stdio: 'pipe' });
      const paneCount = parseInt(execSync('tmux list-panes | wc -l', { encoding: 'utf-8' }).trim());
      applySmartLayout(paneCount);
      execSync(`tmux select-pane -t '{last}'`, { stdio: 'pipe' });
      setStatusMessage(`Attached ${type} window`);
      setTimeout(() => setStatusMessage(''), 2000);
    } catch {
      setStatusMessage(`Failed to attach ${type} window`);
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  return { copyNonGitFiles, runCommandInternal, monitorTestOutput, monitorDevOutput, attachBackgroundWindow } as const;
}
