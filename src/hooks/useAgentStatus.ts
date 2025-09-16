import React, { useEffect, useState, useRef } from 'react';
import { execSync } from 'child_process';
import type { DmuxPane } from '../types.js';

interface UseAgentStatusParams {
  panes: DmuxPane[];
  suspend: boolean; // true when dialogs are open to avoid UI freezing
}

// Move these outside the component to persist across re-renders
const lastCheckTimes = new Map<string, number>();
const statusHistory = new Map<string, Array<'working' | 'waiting' | 'idle'>>();

// Return type: map of pane ID to status
export type AgentStatusMap = Map<string, 'working' | 'waiting' | 'idle' | undefined>;

export default function useAgentStatus({ panes, suspend }: UseAgentStatusParams): AgentStatusMap {
  const [statuses, setStatuses] = useState<AgentStatusMap>(new Map());
  const statusesRef = useRef(statuses);
  const panesRef = useRef(panes);

  // Keep refs up to date
  statusesRef.current = statuses;
  panesRef.current = panes;

  useEffect(() => {
    if (panes.length === 0) return;

    // Clean up maps for panes that no longer exist
    const currentPaneIds = new Set(panesRef.current.map(p => p.id));
    for (const [paneId] of lastCheckTimes) {
      if (!currentPaneIds.has(paneId)) {
        lastCheckTimes.delete(paneId);
        statusHistory.delete(paneId);
      }
    }

    const startupDelay = setTimeout(() => {
      const monitorAgentStatus = async () => {
        if (suspend) return;

        const newStatuses = new Map<string, 'working' | 'waiting' | 'idle' | undefined>();

        await Promise.all(panesRef.current.map(async (pane) => {
          try {
            // Check against our map instead of pane state
            const lastCheck = lastCheckTimes.get(pane.id) || 0;
            if (Date.now() - lastCheck < 500) {
              // Keep current status if too soon to check again
              newStatuses.set(pane.id, statusesRef.current.get(pane.id));
              return;
            }

            // Update check time in map
            lastCheckTimes.set(pane.id, Date.now());

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

            if (!paneExists) {
              // Keep current status if pane doesn't exist in tmux
              newStatuses.set(pane.id, statusesRef.current.get(pane.id));
              return;
            }

            const captureOutput = execSync(
              `tmux capture-pane -t '${effectivePaneId}' -p -S -30`,
              { encoding: 'utf-8', stdio: 'pipe' }
            );

            const lines = captureOutput.split('\n');
            const lastLines = lines.slice(-10).join('\n');

            // First, detect if Claude/opencode is actively working
            let isWorking = false;
            if (pane.agent === 'opencode') {
              const workingPatterns = [
                /esc\s+(to\s+)?interrupt/i,
                /working(\.|\.{2}|\.{3})/i,
              ];
              isWorking = workingPatterns.some(pattern => pattern.test(lastLines));
            } else {
              // For Claude, "esc to interrupt" is the primary indicator it's working
              isWorking = /esc to interrupt/i.test(captureOutput);
            }

            // If actively working, that takes precedence - don't check other patterns
            let newStatus: 'working' | 'waiting' | 'idle' = 'idle';
            if (isWorking) {
              newStatus = 'working';
            } else {
              // Only check for attention patterns if NOT working
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

              const needsAttention = attentionPatterns.some(pattern => pattern.test(captureOutput)) ||
                                     (pane.agent !== 'opencode' && hasClaudeInputBox);

              if (needsAttention) {
                newStatus = 'waiting';
              }

              // Additional Claude-specific checks
              if (pane.agent !== 'opencode') {
                // Check for accept edits specifically (without esc to interrupt means waiting)
                if (/accept edits/i.test(captureOutput)) {
                  newStatus = 'waiting';
                }

                // Check for Claude questions
                const claudeQuestionPatterns = [
                  /I (can|could|should|would|will|may|might)/i,
                  /Let me know/i,
                  /Please (tell|let|inform|advise)/i,
                  /Would you prefer/i,
                  /Should I (proceed|continue|go ahead)/i,
                ];
                if (claudeQuestionPatterns.some(pattern => pattern.test(lastLines))) {
                  newStatus = 'waiting';
                }
              }
            }

            // Add stability check - require consistent status for multiple checks
            const history = statusHistory.get(pane.id) || [];
            const currentStatus = statusesRef.current.get(pane.id) || 'idle';

            // Initialize with current status if no history
            if (history.length === 0 && currentStatus !== 'idle') {
              history.push(currentStatus);
            }

            history.push(newStatus);
            // Keep only last 4 status checks for better stability
            if (history.length > 4) history.shift();
            statusHistory.set(pane.id, history);

            // Determine stable status - require 2 consistent readings to change
            let stableStatus = currentStatus;

            if (history.length >= 2) {
              // Count occurrences of each status in recent history
              const statusCounts = new Map<string, number>();
              history.forEach(s => statusCounts.set(s, (statusCounts.get(s) || 0) + 1));

              // Find the most common status
              let maxCount = 0;
              let mostCommonStatus = stableStatus;
              for (const [status, count] of statusCounts) {
                if (count > maxCount) {
                  maxCount = count;
                  mostCommonStatus = status as 'working' | 'waiting' | 'idle';
                }
              }

              // Only change if new status appears at least twice
              if (mostCommonStatus !== currentStatus && maxCount >= 2) {
                stableStatus = mostCommonStatus;
              }
            }

            // Set the status in the map
            newStatuses.set(pane.id, stableStatus);
          } catch (error) {
            // On error, keep the current status
            newStatuses.set(pane.id, statusesRef.current.get(pane.id));
          }
        }));

        // Update the statuses state if there were any changes
        setStatuses(newStatuses);
      };

      monitorAgentStatus();
      const agentInterval = setInterval(monitorAgentStatus, 2000);
      return () => clearInterval(agentInterval);
    }, 500);

    return () => {
      clearTimeout(startupDelay);
    };
  }, [panes.length, suspend]); // Only re-run if number of panes changes or suspend changes

  return statuses;
}
