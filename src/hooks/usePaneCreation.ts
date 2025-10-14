import { execSync } from 'child_process';
import path from 'path';
import type { DmuxPane } from '../types.js';
import { createPane } from '../utils/paneCreation.js';

interface Params {
  panes: DmuxPane[];
  savePanes: (p: DmuxPane[]) => Promise<void>;
  projectName: string;
  setIsCreatingPane: (v: boolean) => void;
  setStatusMessage: (msg: string) => void;
  setNewPanePrompt: (v: string) => void;
  loadPanes: () => Promise<void>;
  panesFile: string;
  availableAgents: Array<'claude' | 'opencode'>;
  forceRepaint?: () => void;
}

export default function usePaneCreation({ panes, savePanes, projectName, setIsCreatingPane, setStatusMessage, setNewPanePrompt, loadPanes, panesFile, availableAgents, forceRepaint }: Params) {
  const openInEditor = async (currentPrompt: string, setPrompt: (v: string) => void) => {
    try {
      const os = await import('os');
      const fs = await import('fs');
      const tmpFile = path.join(os.tmpdir(), `dmux-prompt-${Date.now()}.md`);
      fs.writeFileSync(tmpFile, currentPrompt || '# Enter your Claude prompt here\n\n');
      const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
      process.stdout.write('\x1b[2J\x1b[H');
      const { spawn } = await import('child_process');
      const editorProcess = spawn(editor, [tmpFile], { stdio: 'inherit', shell: true });
      editorProcess.on('close', () => {
        try {
          const content = fs.readFileSync(tmpFile, 'utf8').replace(/^# Enter your Claude prompt here\s*\n*/m, '').trim();
          setPrompt(content);
          fs.unlinkSync(tmpFile);
          process.stdout.write('\x1b[2J\x1b[H');
        } catch {}
      });
    } catch {}
  };

  const createNewPane = async (prompt: string, agent?: 'claude' | 'opencode') => {
    // CRITICAL: Force repaint FIRST to prevent blank screen
    if (forceRepaint) {
      forceRepaint();
    }

    // Clear the screen before creating pane
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write('\n'.repeat(100));
    try {
      execSync('tmux clear-history', { stdio: 'pipe' });
      execSync('tmux send-keys C-l', { stdio: 'pipe' });
    } catch {}
    await new Promise(r => setTimeout(r, 100));
    try { execSync('tmux refresh-client', { stdio: 'pipe' }); } catch {}

    try {
      // Use the shared pane creation utility
      const result = await createPane(
        {
          prompt,
          agent,
          projectName,
          existingPanes: panes,
        },
        availableAgents
      );

      if (result.needsAgentChoice) {
        // This shouldn't happen in the TUI flow since we handle agent choice
        // before calling createNewPane, but just in case
        setStatusMessage('Agent choice is required');
        setTimeout(() => setStatusMessage(''), 3000);
        return;
      }

      // Save the pane
      const updatedPanes = [...panes, result.pane];
      await savePanes(updatedPanes);

      // Validate the pane was saved by checking the config
      await new Promise(r => setTimeout(r, 100));
      try {
        const fs = await import('fs');
        const configContent = await fs.promises.readFile(panesFile, 'utf-8');
        const config = JSON.parse(configContent);
        const savedPanes = Array.isArray(config) ? config : config.panes || [];
        const paneExists = savedPanes.some((p: DmuxPane) => p.id === result.pane.id);

        if (!paneExists) {
          console.error('Warning: Pane not found in config after save, retrying...');
          await savePanes(updatedPanes);
        }
      } catch (error) {
        console.error('Warning: Could not validate pane save:', error);
      }

      // CRITICAL: Force repaint FIRST before clearing
      if (forceRepaint) {
        forceRepaint();
      }

      // CRITICAL: Aggressive clearing to prevent artifacts
      // 1. Clear screen with ANSI codes (including scrollback)
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

      // 2. Clear tmux history and scrollback
      try {
        execSync('tmux clear-history', { stdio: 'pipe' });
      } catch {}

      // 3. Force tmux client refresh
      try {
        execSync('tmux refresh-client', { stdio: 'pipe' });
      } catch {}

      setNewPanePrompt('');
      await loadPanes();

      // CRITICAL: One more repaint after loadPanes to ensure clean render
      if (forceRepaint) {
        forceRepaint();
      }
    } catch (error) {
      console.error('Failed to create pane:', error);
      setStatusMessage(`Failed to create pane: ${error}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  return { openInEditor, createNewPane } as const;
}
