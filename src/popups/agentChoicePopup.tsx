#!/usr/bin/env node

/**
 * Standalone popup for choosing an agent (Claude or opencode)
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';

interface PopupResult {
  success: boolean;
  data?: 'claude' | 'opencode';
  cancelled?: boolean;
}

interface AgentChoicePopupProps {
  resultFile: string;
  availableAgents: Array<'claude' | 'opencode'>;
  defaultAgent?: 'claude' | 'opencode';
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
    if (key.escape) {
      // User cancelled
      const result: PopupResult = {
        success: false,
        cancelled: true,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    } else if (key.upArrow) {
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
    } else if (key.return) {
      // User confirmed choice
      const result: PopupResult = {
        success: true,
        data: selectedAgent,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    }
  });

  const claudeAvailable = availableAgents.includes('claude');
  const opencodeAvailable = availableAgents.includes('opencode');

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Choose Agent
        </Text>
      </Box>

      {/* Options */}
      <Box flexDirection="column" marginBottom={1}>
        {availableAgents.map((agent, index) => {
          const isSelected = index === selectedIndex;
          const label = agent === 'claude' ? 'Claude Code' : 'opencode';
          return (
            <Box key={agent} marginBottom={index < availableAgents.length - 1 ? 1 : 0}>
              <Text
                color={isSelected ? 'cyan' : 'white'}
                bold={isSelected}
              >
                {isSelected ? '▶ ' : '  '}
                {index + 1}. {label}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Help text */}
      <Box>
        <Text dimColor>↑↓ to navigate • Enter to confirm • ESC to cancel</Text>
      </Box>
    </Box>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const agentsJson = process.argv[3];
  const defaultAgent = process.argv[4] as 'claude' | 'opencode' | undefined;

  if (!resultFile || !agentsJson) {
    console.error('Error: Result file and agents JSON required');
    process.exit(1);
  }

  let availableAgents: Array<'claude' | 'opencode'>;
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
