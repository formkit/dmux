import React from 'react';
import { Box, Text } from 'ink';
import type { HookType } from '../utils/hooks.js';

interface Hook {
  name: string;
  active: boolean;
}

interface HooksDialogProps {
  hooks: Hook[];
  selectedIndex: number;
}

const HOOK_DESCRIPTIONS: Record<string, string> = {
  before_pane_create: 'Before pane creation',
  pane_created: 'After pane, before worktree',
  worktree_created: 'After full setup',
  before_pane_close: 'Before closing pane',
  pane_closed: 'After pane closed',
  before_worktree_remove: 'Before worktree removal',
  worktree_removed: 'After worktree removed',
  pre_merge: 'Before merge operation',
  post_merge: 'After successful merge',
  run_test: 'When tests triggered',
  run_dev: 'When dev server triggered',
};

const HooksDialog: React.FC<HooksDialogProps> = ({
  hooks,
  selectedIndex,
}) => {
  const activeCount = hooks.filter(h => h.active).length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} marginTop={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">Hooks Management</Text>
        <Text dimColor> ({activeCount}/{hooks.length} active)</Text>
      </Box>

      {hooks.map((hook, index) => {
        const isSelected = index === selectedIndex;
        const description = HOOK_DESCRIPTIONS[hook.name] || '';

        return (
          <Box key={hook.name} flexDirection="column">
            <Box>
              <Text color={isSelected ? 'magenta' : 'white'} bold={isSelected}>
                {isSelected ? '▶ ' : '  '}
                {hook.name}
              </Text>
              <Text color={hook.active ? 'green' : 'gray'} dimColor={!isSelected}>
                {' '}[{hook.active ? '✓ active' : 'inactive'}]
              </Text>
            </Box>
            {isSelected && description && (
              <Box marginLeft={3}>
                <Text dimColor>{description}</Text>
              </Box>
            )}
          </Box>
        );
      })}

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold color="yellow">Edit hooks using an agent</Text>
        </Box>
        <Box marginLeft={2}>
          <Text dimColor>Press 'e' to create a pane for editing hooks</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate • e to edit with agent • ESC to close</Text>
      </Box>
    </Box>
  );
};

export default HooksDialog;
