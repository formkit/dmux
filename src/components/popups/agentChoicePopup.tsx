#!/usr/bin/env node

/**
 * Standalone popup for choosing one agent or an A/B agent pair
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { PopupFooters, POPUP_CONFIG } from './config.js';
import {
  buildAgentLaunchOptions,
  type AgentName,
} from '../../utils/agentLaunch.js';

interface AgentChoicePopupProps {
  resultFile: string;
  availableAgents: AgentName[];
  defaultAgent?: AgentName;
}

const AgentChoicePopupApp: React.FC<AgentChoicePopupProps> = ({
  resultFile,
  availableAgents,
  defaultAgent
}) => {
  const options = buildAgentLaunchOptions(availableAgents);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const defaultSingleAgent = defaultAgent || availableAgents[0] || 'claude';
    const defaultIdx = options.findIndex(
      (option) =>
        option.agents.length === 1 && option.agents[0] === defaultSingleAgent
    );
    return Math.max(0, defaultIdx);
  });
  const { exit } = useApp();

  const selectedOption = options[selectedIndex] || options[0];

  useInput((input, key) => {
    if (options.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(options.length - 1, selectedIndex + 1));
    } else if (key.leftArrow || input.toLowerCase() === 'c') {
      // Find Claude index
      const claudeIdx = options.findIndex(
        (option) => option.agents.length === 1 && option.agents[0] === 'claude'
      );
      if (claudeIdx >= 0) setSelectedIndex(claudeIdx);
    } else if (key.rightArrow || input.toLowerCase() === 'o') {
      // Find OpenCode index
      const opencodeIdx = options.findIndex(
        (option) => option.agents.length === 1 && option.agents[0] === 'opencode'
      );
      if (opencodeIdx >= 0) setSelectedIndex(opencodeIdx);
    } else if (input.toLowerCase() === 'x') {
      // Find codex index
      const codexIdx = options.findIndex(
        (option) => option.agents.length === 1 && option.agents[0] === 'codex'
      );
      if (codexIdx >= 0) setSelectedIndex(codexIdx);
    } else if (/^[1-9]$/.test(input)) {
      const numericIndex = Number.parseInt(input, 10) - 1;
      if (numericIndex >= 0 && numericIndex < options.length) {
        setSelectedIndex(numericIndex);
      }
    } else if (key.return) {
      if (!selectedOption) return;
      // User confirmed choice
      writeSuccessAndExit(resultFile, selectedOption.agents, exit);
    }
  });

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.choice()}>
        {/* Options */}
        <Box flexDirection="column">
          {options.length === 0 && (
            <Text dimColor>No agents available</Text>
          )}
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={option.id} marginBottom={index < options.length - 1 ? 1 : 0}>
                <Text
                  color={isSelected ? POPUP_CONFIG.titleColor : 'white'}
                  bold={isSelected}
                >
                  {isSelected ? '▶ ' : '  '}
                  {index + 1}. {option.label}
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
  const defaultAgent = process.argv[4] as AgentName | undefined;

  if (!resultFile || !agentsJson) {
    console.error('Error: Result file and agents JSON required');
    process.exit(1);
  }

  let availableAgents: AgentName[];
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
