import React from 'react';
import { Box, Text } from 'ink';

interface AgentChoiceDialogProps {
  agentChoice: 'claude' | 'opencode' | 'vibe' | null;
}

const AgentChoiceDialog: React.FC<AgentChoiceDialogProps> = ({ agentChoice }) => {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
      <Box flexDirection="column">
        <Text>Select agent (←/→, 1/2, C/O, Enter, ESC):</Text>
        <Box marginTop={1} gap={3}>
          <Text color={agentChoice === 'claude' ? 'cyan' : 'white'}>
            {agentChoice === 'claude' ? '▶ Claude Code' : '  Claude Code'}
          </Text>
          <Text color={agentChoice === 'opencode' ? 'cyan' : 'white'}>
            {agentChoice === 'opencode' ? '▶ opencode' : '  opencode'}
          </Text>
          <Text color={agentChoice === 'vibe' ? 'cyan' : 'white'}>
            {agentChoice === 'vibe' ? '▶ Mistral Vibe' : '  Mistral Vibe'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default AgentChoiceDialog;
