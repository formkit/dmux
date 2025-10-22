import path from 'path';
import type { DmuxPane } from '../types.js';
import { createPane } from '../utils/paneCreation.js';
import { LogService } from '../services/LogService.js';
import { TmuxService } from '../services/TmuxService.js';

interface Params {
  panes: DmuxPane[];
  savePanes: (p: DmuxPane[]) => Promise<void>;
  projectName: string;
  setIsCreatingPane: (v: boolean) => void;
  setStatusMessage: (msg: string) => void;
  loadPanes: () => Promise<void>;
  panesFile: string;
  availableAgents: Array<'claude' | 'opencode'>;
  forceRepaint?: () => void;
}

export default function usePaneCreation({ panes, savePanes, projectName, setIsCreatingPane, setStatusMessage, loadPanes, panesFile, availableAgents, forceRepaint }: Params) {
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

    // Minimal clearing to avoid layout shifts
    process.stdout.write('\x1b[2J\x1b[H');

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
          const msg = 'Pane not found in config after save, retrying...';
          console.error('Warning:', msg);
          LogService.getInstance().warn(msg, 'usePaneCreation', result.pane.id);
          await savePanes(updatedPanes);
        }
      } catch (error) {
        const msg = 'Could not validate pane save';
        console.error('Warning:', msg, error);
        LogService.getInstance().warn(msg, 'usePaneCreation', result.pane.id);
      }

      // CRITICAL: Force repaint FIRST before clearing
      if (forceRepaint) {
        forceRepaint();
      }

      // CRITICAL: Aggressive clearing to prevent artifacts
      // 1. Clear screen with ANSI codes (including scrollback)
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

      const tmuxService = TmuxService.getInstance();

      // 2. Clear tmux history and scrollback
      tmuxService.clearHistorySync();

      // 3. Force tmux client refresh
      tmuxService.refreshClientSync();

      await loadPanes();

      // CRITICAL: One more repaint after loadPanes to ensure clean render
      if (forceRepaint) {
        forceRepaint();
      }
    } catch (error) {
      const msg = 'Failed to create pane';
      console.error(msg, error);
      LogService.getInstance().error(msg, 'usePaneCreation', undefined, error instanceof Error ? error : undefined);
      setStatusMessage(`Failed to create pane: ${error}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  return { openInEditor, createNewPane } as const;
}
