import { useEffect, useRef } from 'react';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import type { DmuxPane } from '../types.js';

interface UseAgentStatusParams {
  panes: DmuxPane[];
  setPanes: (p: DmuxPane[]) => void;
  panesFile: string;
  suspend: boolean; // true when dialogs are open to avoid UI freezing
  loadPanes: () => Promise<void>;
}

export default function useAgentStatus({ panes, setPanes, panesFile, suspend, loadPanes }: UseAgentStatusParams) {
  // Track last check times separately from pane state to avoid re-renders
  const lastCheckTimes = useRef<Map<string, number>>(new Map());
  
  useEffect(() => {
    if (panes.length === 0) return;

    const startupDelay = setTimeout(() => {
      const monitorAgentStatus = async () => {
        if (suspend) return;

        const updatedPanesWithNulls = await Promise.all(panes.map(async (pane) => {
          try {
            // Check against our ref instead of pane state
            const lastCheck = lastCheckTimes.current.get(pane.id) || 0;
            if (Date.now() - lastCheck < 500) {
              return pane;
            }
            
            // Update check time in ref
            lastCheckTimes.current.set(pane.id, Date.now());

            let effectivePaneId = pane.paneId;
            let paneExists = false;
            try {
              const paneIds = execSync(`tmux list-panes -s -F '#{pane_id}'`, {
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 500,
              }).trim().split('\n').filter(id => id && id.startsWith('%'));
              paneExists = paneIds.includes(effectivePaneId);
              if (!paneExists) {
                try {
                  const out = execSync(`tmux list-panes -s -F '#{pane_id}::#{pane_title}'`, {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    timeout: 500,
                  }).trim();
                  if (out) {
                    const titleToId = new Map<string, string>();
                    out.split('\n').forEach(line => {
                      const [id, title] = line.split('::');
                      if (id && title) titleToId.set(title.trim(), id);
                    });
                    const remappedId = titleToId.get(pane.slug);
                    if (remappedId) {
                      effectivePaneId = remappedId;
                      paneExists = true;
                    }
                  }
                } catch {}
              }
            } catch {
              paneExists = true;
            }

            if (!paneExists) return null;

            const captureOutput = execSync(
              `tmux capture-pane -t '${effectivePaneId}' -p -S -30`,
              { encoding: 'utf-8', stdio: 'pipe' }
            );

            const lines = captureOutput.split('\n');
            const lastLines = lines.slice(-10).join('\n');

            let isWorking = false;
            if (pane.agent === 'opencode') {
              const workingPatterns = [
                /esc\s+(to\s+)?interrupt/i,
                /working(\.|\.{2}|\.{3})/i,
              ];
              isWorking = workingPatterns.some(pattern => pattern.test(lastLines));
            } else {
              const workingPatterns = [/esc to interrupt/i];
              isWorking = workingPatterns.some(pattern => pattern.test(captureOutput));
            }

            const attentionPatterns = [
              /\?\s*$/m,
              /y\/n/i,
              /yes.*no/i,
              /\ballow\b.*\?/i,
              /\bapprove\b.*\?/i,
              /\bgrant\b.*\?/i,
              /\btrust\b.*\?/i,
              /\baccept\b.*\?/i,
              /\bcontinue\b.*\?/i,
              /\bproceed\b.*\?/i,
              /permission/i,
              /confirmation/i,
              /press.*enter/i,
              /waiting for/i,
              /are you sure/i,
              /would you like/i,
              /do you want/i,
              /please confirm/i,
              /requires.*approval/i,
              /needs.*input/i,
              /⏵⏵\s*accept edits/i,
              /shift\+tab to cycle/i,
            ];

            const hasClaudeInputBox = /╭─+╮/.test(lastLines) && /╰─+╯/.test(lastLines) && /│\s+>\s+.*│/.test(lastLines);

            const needsAttention = attentionPatterns.some(pattern => pattern.test(captureOutput)) || (pane.agent !== 'opencode' && hasClaudeInputBox);

            let newStatus: 'working' | 'waiting' | 'idle' = 'idle';
            if (isWorking) newStatus = 'working';
            else if (needsAttention && !isWorking) newStatus = 'waiting';

            if (pane.agent !== 'opencode') {
              if (/accept edits/i.test(captureOutput) && !/esc to interrupt/i.test(captureOutput)) {
                newStatus = 'waiting';
              }
              if (hasClaudeInputBox && !isWorking) newStatus = 'waiting';
              const claudeQuestionPatterns = [
                /I (can|could|should|would|will|may|might)/i,
                /Let me know/i,
                /Please (tell|let|inform|advise)/i,
                /Would you prefer/i,
                /Should I (proceed|continue|go ahead)/i,
              ];
              if (claudeQuestionPatterns.some(pattern => pattern.test(lastLines)) && !isWorking) {
                newStatus = 'waiting';
              }
            }

            // Only return updated pane if status actually changed
            if (pane.agentStatus !== newStatus || pane.paneId !== effectivePaneId) {
              return { ...pane, paneId: effectivePaneId, agentStatus: newStatus };
            }

            // No changes, return original pane
            return pane;
          } catch {
            return null;
          }
        }));

        const updatedPanes = updatedPanesWithNulls.filter((pane): pane is DmuxPane => pane !== null);
        const panesRemoved = updatedPanes.length < panes.length;
        const idsChanged = updatedPanes.some((pane, index) => pane.paneId !== panes[index]?.paneId);

        if (panesRemoved || idsChanged) {
          // Save in config format
          let config: any = { panes: [] };
          try {
            const content = await fs.readFile(panesFile, 'utf-8');
            const parsed = JSON.parse(content);
            if (!Array.isArray(parsed)) {
              config = parsed;
            }
          } catch {}
          
          config.panes = updatedPanes;
          config.lastUpdated = new Date().toISOString();
          await fs.writeFile(panesFile, JSON.stringify(config, null, 2));
          await loadPanes();
        } else {
          const hasStatusChanges = updatedPanes.some((pane, index) => {
            const oldPane = panes[index];
            return oldPane && (pane.agentStatus !== oldPane.agentStatus || pane.paneId !== oldPane.paneId);
          });
          if (hasStatusChanges) setPanes(updatedPanes);
        }
      };

      monitorAgentStatus();
      const agentInterval = setInterval(monitorAgentStatus, 2000);
      return () => clearInterval(agentInterval);
    }, 500);

    return () => {
      clearTimeout(startupDelay);
    };
  }, [JSON.stringify(panes.map(p => ({ id: p.id, paneId: p.paneId, agent: p.agent }))), suspend, panesFile]);
}
