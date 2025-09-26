import { execSync } from 'child_process';
import path from 'path';
import type { DmuxPane } from '../types.js';
import { applySmartLayout } from '../utils/tmux.js';
import { generateSlug } from '../utils/slug.js';

interface Params {
  panes: DmuxPane[];
  savePanes: (p: DmuxPane[]) => Promise<void>;
  projectName: string;
  setIsCreatingPane: (v: boolean) => void;
  setStatusMessage: (msg: string) => void;
  setNewPanePrompt: (v: string) => void;
  loadPanes: () => Promise<void>;
  panesFile: string;
}

export default function usePaneCreation({ panes, savePanes, projectName, setIsCreatingPane, setStatusMessage, setNewPanePrompt, loadPanes, panesFile }: Params) {
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
    setIsCreatingPane(true);
    setStatusMessage('Generating slug...');

    const slug = await generateSlug(prompt);
    setStatusMessage(`Creating worktree: ${slug}...`);

    let projectRoot: string;
    try {
      projectRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    } catch {
      projectRoot = process.cwd();
    }

    const worktreePath = path.join(projectRoot, '.dmux', 'worktrees', slug);
    const originalPaneId = execSync('tmux display-message -p "#{pane_id}"', { encoding: 'utf-8' }).trim();

    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write('\n'.repeat(100));
    try {
      execSync('tmux clear-history', { stdio: 'pipe' });
      execSync('tmux send-keys C-l', { stdio: 'pipe' });
    } catch {}
    await new Promise(r => setTimeout(r, 100));
    try { execSync('tmux refresh-client', { stdio: 'pipe' }); } catch {}

    const paneCount = parseInt(execSync('tmux list-panes | wc -l', { encoding: 'utf-8' }).trim());
    try { execSync(`tmux set-option -g pane-border-status top`, { stdio: 'pipe' }); } catch {}

    const paneInfo = execSync(`tmux split-window -h -P -F '#{pane_id}'`, { encoding: 'utf-8' }).trim();
    await new Promise(r => setTimeout(r, 500));
    try { execSync(`tmux select-pane -t '${paneInfo}' -T "${slug}"`, { stdio: 'pipe' }); } catch {}

    applySmartLayout(paneCount + 1);

    try {
      const worktreeCmd = `git worktree add "${worktreePath}" -b ${slug} 2>/dev/null ; cd "${worktreePath}"`;
      execSync(`tmux send-keys -t '${paneInfo}' '${worktreeCmd}' Enter`, { stdio: 'pipe' });
      await new Promise(r => setTimeout(r, 2500));
      execSync(`tmux send-keys -t '${paneInfo}' 'echo "Worktree created at:" && pwd' Enter`, { stdio: 'pipe' });
      await new Promise(r => setTimeout(r, 500));
      setStatusMessage(agent ? `Worktree created, launching ${agent === 'opencode' ? 'opencode' : 'Claude'}...` : 'Worktree created.');
    } catch (error) {
      setStatusMessage(`Warning: Worktree issue: ${error}` as any);
      execSync(`tmux send-keys -t '${paneInfo}' 'cd "${worktreePath}" 2>/dev/null || (echo "ERROR: Failed to create/enter worktree ${slug}" && pwd)' Enter`, { stdio: 'pipe' });
      await new Promise(r => setTimeout(r, 1000));
    }

    let escapedCmd = '';
    if (agent === 'claude') {
      let claudeCmd: string;
      if (prompt && prompt.trim()) {
        const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        claudeCmd = `claude "${escapedPrompt}" --permission-mode=acceptEdits`;
      } else {
        claudeCmd = `claude --permission-mode=acceptEdits`;
      }
      escapedCmd = claudeCmd.replace(/'/g, "'\\''");
      execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
    } else if (agent === 'opencode') {
      const openCoderCmd = `opencode`;
      const escapedOpenCmd = openCoderCmd.replace(/'/g, "'\\''");
      execSync(`tmux send-keys -t '${paneInfo}' '${escapedOpenCmd}'`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
      if (prompt && prompt.trim()) {
        await new Promise(r => setTimeout(r, 1500));
        const bufName = `dmux_prompt_${Date.now()}`;
        const promptEsc = prompt.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
        execSync(`tmux set-buffer -b '${bufName}' -- '${promptEsc}'`, { stdio: 'pipe' });
        execSync(`tmux paste-buffer -b '${bufName}' -t '${paneInfo}'`, { stdio: 'pipe' });
        await new Promise(r => setTimeout(r, 200));
        execSync(`tmux delete-buffer -b '${bufName}'`, { stdio: 'pipe' });
        execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
      }
    }

    execSync(`tmux select-pane -t '${paneInfo}'`, { stdio: 'pipe' });

    const newPane: DmuxPane = {
      id: `dmux-${Date.now()}`,
      slug,
      prompt: prompt || 'No initial prompt',
      paneId: paneInfo,
      worktreePath,
      agent,
    };

    const updatedPanes = [...panes, newPane];
    await savePanes(updatedPanes);

    // Validate the pane was saved by checking the config
    // This helps catch race conditions
    await new Promise(r => setTimeout(r, 100)); // Small delay to ensure write completes
    try {
      const fs = await import('fs');
      const configContent = await fs.promises.readFile(panesFile, 'utf-8');
      const config = JSON.parse(configContent);
      const savedPanes = Array.isArray(config) ? config : config.panes || [];
      const paneExists = savedPanes.some((p: DmuxPane) => p.id === newPane.id);

      if (!paneExists) {
        // Retry the save if pane wasn't found
        console.error('Warning: Pane not found in config after save, retrying...');
        await savePanes(updatedPanes);
      }
    } catch (error) {
      console.error('Warning: Could not validate pane save:', error);
    }

    execSync(`tmux select-pane -t '${originalPaneId}'`, { stdio: 'pipe' });
    try { execSync(`tmux select-pane -t '${originalPaneId}' -T "dmux-${projectName}"`, { stdio: 'pipe' }); } catch {}
    process.stdout.write('\x1b[2J\x1b[H');

    setIsCreatingPane(false);
    setStatusMessage('');
    setNewPanePrompt('');
    await loadPanes();
  };

  return { openInEditor, createNewPane } as const;
}
