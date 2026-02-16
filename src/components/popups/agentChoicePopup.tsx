#!/usr/bin/env node

/**
 * Standalone popup for choosing an agent (Claude or opencode)
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { PopupFooters, POPUP_CONFIG } from './config.js';

interface AgentChoicePopupProps {
  resultFile: string;
  availableAgents: Array<'claude' | 'opencode' | 'codex'>;
  defaultAgent?: 'claude' | 'opencode' | 'codex';
}

const AgentChoicePopupApp: React.FC<AgentChoicePopupProps> = ({
  resultFile,
  availableAgents,
  defaultAgent
}) => {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const defaultIdx = availableAgents.indexOf(defaultAgent || availableAgents[0] || 'claude');
    return Math.max(0, defaultIdx);
  });
  const { exit } = useApp();

  const selectedAgent = availableAgents[selectedIndex];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(availableAgents.length - 1, selectedIndex + 1));
    } else if (key.leftArrow || input === '1' || input.toLowerCase() === 'c') {
      // Find claude index
      const claudeIdx = availableAgents.indexOf('claude');
      if (claudeIdx >= 0) setSelectedIndex(claudeIdx);
    } else if (key.rightArrow || input === '2' || input.toLowerCase() === 'o') {
      // Find opencode index
      const opencodeIdx = availableAgents.indexOf('opencode');
      if (opencodeIdx >= 0) setSelectedIndex(opencodeIdx);
    } else if (input === '3' || input.toLowerCase() === 'x') {
      // Find codex index
      const codexIdx = availableAgents.indexOf('codex');
      if (codexIdx >= 0) setSelectedIndex(codexIdx);
    } else if (key.return) {
      // User confirmed choice
      writeSuccessAndExit(resultFile, selectedAgent, exit);
    }
  });

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.choice()}>
        {/* Options */}
        <Box flexDirection="column">
          {availableAgents.map((agent, index) => {
            const isSelected = index === selectedIndex;
            const label = agent === 'claude' ? 'Claude Code' : agent === 'codex' ? 'Codex' : 'opencode';
            return (
              <Box key={agent} marginBottom={index < availableAgents.length - 1 ? 1 : 0}>
                <Text
                  color={isSelected ? POPUP_CONFIG.titleColor : 'white'}
                  bold={isSelected}
                >
                  {isSelected ? '▶ ' : '  '}
                  {index + 1}. {label}
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
  const defaultAgent = process.argv[4] as 'claude' | 'opencode' | 'codex' | undefined;

  if (!resultFile || !agentsJson) {
    console.error('Error: Result file and agents JSON required');
    process.exit(1);
  }

  let availableAgents: Array<'claude' | 'opencode' | 'codex'>;
  try {
    availableAgents = JSON.parse(agentsJson);
  } catch (error) {
    console.error('Error: Failed to parse agents JSON');
    process.exit(1);
  }

  render(
    <AgentChoicePopupApp
      resultFile={resultFile}
      availableAgents={availableAgents}
      defaultAgent={defaultAgent}
    />
  );
}

main();
