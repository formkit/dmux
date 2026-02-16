import React from 'react';
import { Box, Text } from 'ink';

interface AgentChoiceDialogProps {
  agentChoice: 'claude' | 'opencode' | 'codex' | null;
}

const AgentChoiceDialog: React.FC<AgentChoiceDialogProps> = ({ agentChoice }) => {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
      <Box flexDirection="column">
        <Text>Select agent (←/→, 1/2/3, C/O/X, Enter, ESC):</Text>
        <Box marginTop={1} gap={3}>
          <Text color={agentChoice === 'claude' ? 'cyan' : 'white'}>
            {agentChoice === 'claude' ? '▶ Claude Code' : '  Claude Code'}
          </Text>
          <Text color={agentChoice === 'opencode' ? 'cyan' : 'white'}>
            {agentChoice === 'opencode' ? '▶ opencode' : '  opencode'}
          </Text>
          <Text color={agentChoice === 'codex' ? 'cyan' : 'white'}>
            {agentChoice === 'codex' ? '▶ Codex' : '  Codex'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default AgentChoiceDialog;
