import React from 'react';
import { Box, Text } from 'ink';
import type { SettingDefinition, DmuxSettings, SettingsScope } from '../types.js';

interface SettingsDialogProps {
  settings: DmuxSettings;
  globalSettings: DmuxSettings;
  projectSettings: DmuxSettings;
  settingDefinitions: SettingDefinition[];
  selectedIndex: number;
  mode: 'list' | 'edit' | 'scope';
  editingKey?: keyof DmuxSettings;
  editingValueIndex?: number;
  scopeIndex?: number;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  settings,
  globalSettings,
  projectSettings,
  settingDefinitions,
  selectedIndex,
  mode,
  editingKey,
  editingValueIndex = 0,
  scopeIndex = 0,
}) => {
  // Get the current setting definition being edited
  const currentDef = editingKey ? settingDefinitions.find(d => d.key === editingKey) : null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Settings</Text>
      </Box>

      {mode === 'list' && (
        <>
          {settingDefinitions.map((def, index) => {
            const isSelected = index === selectedIndex;

            // Handle action type differently - no value display
            if (def.type === 'action') {
              return (
                <Box key={def.key}>
                  <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                    {isSelected ? '▶ ' : '  '}
                    {def.label}
                  </Text>
                  <Text color={isSelected ? 'cyan' : 'gray'} dimColor={!isSelected}>
                    {' '}(press Enter)
                  </Text>
                </Box>
              );
            }

            const currentValue = settings[def.key as keyof DmuxSettings];
            const isProjectOverride = def.key in projectSettings;
            const isGlobalSetting = def.key in globalSettings;

            let displayValue: string;
            let scopeLabel: string;

            if (currentValue === undefined || currentValue === null) {
              displayValue = 'none';
              scopeLabel = '';
            } else {
              if (def.type === 'boolean') {
                displayValue = currentValue ? 'on' : 'off';
              } else if (def.type === 'select' && def.options) {
                const option = def.options.find(o => o.value === currentValue);
                displayValue = option?.label || 'none';
              } else {
                displayValue = String(currentValue);
              }

              scopeLabel = isProjectOverride ? ' - project setting' : (isGlobalSetting ? ' - global setting' : '');
            }

            return (
              <Box key={def.key}>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                  {def.label}
                </Text>
                <Text color={isSelected ? 'cyan' : 'gray'} dimColor={!isSelected}>
                  {' '}({displayValue}{scopeLabel})
                </Text>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>↑↓ to navigate • Enter to select • ESC to cancel</Text>
          </Box>
        </>
      )}

      {mode === 'edit' && currentDef && (
        <>
          <Box marginBottom={1}>
            <Text bold>{currentDef.label}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>{currentDef.description}</Text>
          </Box>

          {currentDef.type === 'boolean' && (
            <>
              <Box>
                <Text color={editingValueIndex === 0 ? 'cyan' : 'white'} bold={editingValueIndex === 0}>
                  {editingValueIndex === 0 ? '▶ ' : '  '}Enable
                </Text>
              </Box>
              <Box>
                <Text color={editingValueIndex === 1 ? 'cyan' : 'white'} bold={editingValueIndex === 1}>
                  {editingValueIndex === 1 ? '▶ ' : '  '}Disable
                </Text>
              </Box>
            </>
          )}

          {currentDef.type === 'select' && currentDef.options && (
            <>
              {currentDef.options.map((option, index) => (
                <Box key={option.value}>
                  <Text color={editingValueIndex === index ? 'cyan' : 'white'} bold={editingValueIndex === index}>
                    {editingValueIndex === index ? '▶ ' : '  '}{option.label}
                  </Text>
                </Box>
              ))}
            </>
          )}

          <Box marginTop={1}>
            <Text dimColor>↑↓ to navigate • Enter to select • ESC to cancel</Text>
          </Box>
        </>
      )}

      {mode === 'scope' && currentDef && (
        <>
          <Box marginBottom={1}>
            <Text bold>Save {currentDef.label} as:</Text>
          </Box>

          <Box>
            <Text color={scopeIndex === 0 ? 'cyan' : 'white'} bold={scopeIndex === 0}>
              {scopeIndex === 0 ? '▶ ' : '  '}Global (all projects)
            </Text>
          </Box>
          <Box>
            <Text color={scopeIndex === 1 ? 'cyan' : 'white'} bold={scopeIndex === 1}>
              {scopeIndex === 1 ? '▶ ' : '  '}Project only
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text dimColor>↑↓ to navigate • Enter to select • ESC to cancel</Text>
          </Box>
        </>
      )}
    </Box>
  );
};

export default SettingsDialog;
