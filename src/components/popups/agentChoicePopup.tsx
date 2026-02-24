#!/usr/bin/env node

/**
 * Standalone popup for choosing one or more agents.
 * Runs in a tmux popup modal and writes result to a file.
 */

import React, { useMemo, useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { POPUP_CONFIG } from './config.js';
import {
  getAgentLabel,
  getAgentShortLabel,
  isAgentName,
  type AgentName,
} from '../../utils/agentLaunch.js';

interface AgentChoicePopupProps {
  resultFile: string;
  availableAgents: AgentName[];
  initialSelectedAgents: AgentName[];
}

const AgentChoicePopupApp: React.FC<AgentChoicePopupProps> = ({
  resultFile,
  availableAgents,
  initialSelectedAgents,
}) => {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const firstSelectedIndex = availableAgents.findIndex((agent) =>
      initialSelectedAgents.includes(agent)
    );
    return firstSelectedIndex >= 0 ? firstSelectedIndex : 0;
  });
  const [selectedAgents, setSelectedAgents] = useState<Set<AgentName>>(
    () =>
      new Set<AgentName>(
        availableAgents.filter((agent) => initialSelectedAgents.includes(agent))
      )
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const orderedSelections = useMemo(
    () => availableAgents.filter((agent) => selectedAgents.has(agent)),
    [availableAgents, selectedAgents]
  );
  const selectedCount = orderedSelections.length;

  const toggleSelectedAgent = () => {
    const agent = availableAgents[selectedIndex];
    if (!agent) return;

    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agent)) {
        next.delete(agent);
      } else {
        next.add(agent);
      }
      return next;
    });
    setValidationError(null);
  };

  useInput((input, key) => {
    if (availableAgents.length === 0) {
      if (key.return) {
        writeSuccessAndExit(resultFile, [], exit);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(availableAgents.length - 1, prev + 1));
      return;
    }

    if (input === ' ') {
      toggleSelectedAgent();
      return;
    }

    if (key.return) {
      if (orderedSelections.length === 0) {
        setValidationError('Select at least one agent.');
        return;
      }
      writeSuccessAndExit(resultFile, orderedSelections, exit);
    }
  });

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer="↑↓ navigate • Space toggle • Enter launch • ESC cancel">
        <Box marginBottom={1}>
          <Text dimColor>
            Select one or more agents, then press Enter to launch.
          </Text>
          <Text color={POPUP_CONFIG.titleColor}>
            Selected: {selectedCount}/{availableAgents.length}
          </Text>
          {validationError && (
            <Text color="red">{validationError}</Text>
          )}
        </Box>

        <Box flexDirection="column">
          {availableAgents.length === 0 && (
            <Text dimColor>No enabled agents available</Text>
          )}
          {availableAgents.map((agent, index) => {
            const isSelectedRow = index === selectedIndex;
            const isChecked = selectedAgents.has(agent);
            const marker = isChecked ? '◉' : '◎';
            const markerColor = isChecked ? POPUP_CONFIG.successColor : 'white';

            return (
              <Box key={agent}>
                <Text color={markerColor} bold={isChecked}>
                  {marker}
                </Text>
                <Text
                  color={isSelectedRow ? POPUP_CONFIG.titleColor : 'white'}
                  bold={isSelectedRow}
                >
                  {' '}
                  {getAgentLabel(agent)}
                </Text>
                <Text color={isSelectedRow ? POPUP_CONFIG.titleColor : 'gray'}>
                  {' '}
                  {getAgentShortLabel(agent)}
                </Text>
              </Box>
            );
          })}
        </Box>
      </PopupContainer>
    </PopupWrapper>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const agentsJson = process.argv[3];
  const initialSelectedJson = process.argv[4];

  if (!resultFile || !agentsJson) {
    console.error('Error: Result file and agents JSON required');
    process.exit(1);
  }

  let availableAgents: AgentName[];
  try {
    availableAgents = JSON.parse(agentsJson);
  } catch {
    console.error('Error: Failed to parse agents JSON');
    process.exit(1);
  }

  let initialSelectedAgents: AgentName[] = [];
  if (initialSelectedJson) {
    try {
      const parsed = JSON.parse(initialSelectedJson);
      if (Array.isArray(parsed)) {
        initialSelectedAgents = parsed.filter((agent): agent is AgentName =>
          isAgentName(agent)
        );
      }
    } catch {
      // Ignore invalid initial selection payloads and fall back to no preselection.
    }
  }

  render(
    <AgentChoicePopupApp
      resultFile={resultFile}
      availableAgents={availableAgents}
      initialSelectedAgents={initialSelectedAgents}
    />
  );
}

main();
