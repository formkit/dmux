import path from 'path';
import type { DmuxPane } from '../types.js';
import { createPane } from '../utils/paneCreation.js';
import { LogService } from '../services/LogService.js';

interface Params {
  panes: DmuxPane[];
  savePanes: (p: DmuxPane[]) => Promise<void>;
  projectName: string;
  sessionProjectRoot: string;
  panesFile: string;
  setIsCreatingPane: (v: boolean) => void;
  setStatusMessage: (msg: string) => void;
  loadPanes: () => Promise<void>;
  availableAgents: Array<'claude' | 'opencode' | 'codex'>;
}

interface CreateNewPaneOptions {
  existingPanes?: DmuxPane[];
  slugSuffix?: string;
  slugBase?: string;
  targetProjectRoot?: string;
}

export default function usePaneCreation({
  panes,
  savePanes,
  projectName,
  sessionProjectRoot,
  panesFile,
  setIsCreatingPane,
  setStatusMessage,
  loadPanes,
  availableAgents,
}: Params) {
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

  const createNewPane = async (
    prompt: string,
    agent?: 'claude' | 'opencode' | 'codex',
    options: CreateNewPaneOptions = {}
  ): Promise<DmuxPane | null> => {
    const panesForCreation = options.existingPanes ?? panes;

    try {
      setIsCreatingPane(true)
      setStatusMessage("Creating pane...")

      // Use the shared pane creation utility
      const result = await createPane(
        {
          prompt,
          agent,
          projectName,
          existingPanes: panesForCreation,
          slugSuffix: options.slugSuffix,
          slugBase: options.slugBase,
          projectRoot: options.targetProjectRoot,
          sessionProjectRoot,
          sessionConfigPath: panesFile,
        },
        availableAgents
      );

      if (result.needsAgentChoice) {
        // This shouldn't happen in the TUI flow since we handle agent choice
        // before calling createNewPane, but just in case
        setStatusMessage('Agent choice is required');
        setTimeout(() => setStatusMessage(''), 3000);
        return null;
      }

      // Save the pane
      const updatedPanes = [...panesForCreation, result.pane];
      await savePanes(updatedPanes);

      await loadPanes();
      setStatusMessage("Pane created")
      setTimeout(() => setStatusMessage(""), 2000)
      return result.pane;
    } catch (error) {
      const msg = 'Failed to create pane';
      LogService.getInstance().error(msg, 'usePaneCreation', undefined, error instanceof Error ? error : undefined);
      setStatusMessage(`Failed to create pane: ${error}`);
      setTimeout(() => setStatusMessage(''), 3000);
      return null;
    } finally {
      setIsCreatingPane(false)
    }
  };

  return { openInEditor, createNewPane } as const;
}
