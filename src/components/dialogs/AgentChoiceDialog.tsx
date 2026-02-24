import React from 'react';
import { Box, Text } from 'ink';
import {
  getAgentDefinitions,
  type AgentName,
} from '../../utils/agentLaunch.js';

interface AgentChoiceDialogProps {
  agentChoice: AgentName | null;
}

const AgentChoiceDialog: React.FC<AgentChoiceDialogProps> = ({ agentChoice }) => {
  const agents = getAgentDefinitions();

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
      <Box flexDirection="column">
        <Text>Select agent (↑/↓, Enter, ESC):</Text>
        <Box marginTop={1} gap={3}>
          {agents.map((agent) => (
            <Text key={agent.id} color={agentChoice === agent.id ? 'cyan' : 'white'}>
              {agentChoice === agent.id ? `▶ ${agent.name}` : `  ${agent.name}`}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default AgentChoiceDialog;
