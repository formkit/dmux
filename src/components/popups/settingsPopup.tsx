#!/usr/bin/env node

/**
 * Standalone popup for settings
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import type { SettingDefinition, DmuxSettings } from '../../types.js';
import { POPUP_CONFIG } from './config.js';
import {
  PopupWrapper,
  writeSuccessAndExit,
  writeCancelAndExit,
} from './shared/index.js';

interface SettingsPopupProps {
  resultFile: string;
  settingDefinitions: SettingDefinition[];
  settings: DmuxSettings;
  globalSettings: DmuxSettings;
  projectSettings: DmuxSettings;
}

const SettingsPopupApp: React.FC<SettingsPopupProps> = ({
  resultFile,
  settingDefinitions,
  settings,
  globalSettings,
  projectSettings,
}) => {
  const [mode, setMode] = useState<'list' | 'edit' | 'scope'>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingKey, setEditingKey] = useState<string | undefined>();
  const [editingValueIndex, setEditingValueIndex] = useState(0);
  const [textValue, setTextValue] = useState('');
  const [scopeIndex, setScopeIndex] = useState(0);
  const { exit } = useApp();

  const currentDef = editingKey ? settingDefinitions.find(d => d.key === editingKey) : null;

  const isTextEditing = mode === 'edit' && currentDef?.type === 'text';

  useInput((input, key) => {
    // When editing a text field, only handle escape — let TextInput handle everything else
    if (isTextEditing && !key.escape) return;

    if (key.escape) {
      if (mode === 'list') {
        // Exit the popup - helper handles result writing
        writeCancelAndExit(resultFile, exit);
      } else {
        // Go back to list
        setMode('list');
        setEditingKey(undefined);
        setEditingValueIndex(0);
        setTextValue('');
        setScopeIndex(0);
      }
    } else if (key.upArrow) {
      if (mode === 'list') {
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      } else if (mode === 'edit') {
        setEditingValueIndex(Math.max(0, editingValueIndex - 1));
      } else if (mode === 'scope') {
        setScopeIndex(Math.max(0, scopeIndex - 1));
      }
    } else if (key.downArrow) {
      if (mode === 'list') {
        setSelectedIndex(Math.min(settingDefinitions.length - 1, selectedIndex + 1));
      } else if (mode === 'edit') {
        const currentDef = settingDefinitions.find(d => d.key === editingKey);
        if (currentDef) {
          const maxIndex = currentDef.type === 'boolean' ? 1 : (currentDef.options?.length || 1) - 1;
          setEditingValueIndex(Math.min(maxIndex, editingValueIndex + 1));
        }
      } else if (mode === 'scope') {
        setScopeIndex(Math.min(1, scopeIndex + 1));
      }
    } else if (key.return) {
      if (mode === 'list') {
        const currentDef = settingDefinitions[selectedIndex];

        // Handle action type - return action name
        if (currentDef.type === 'action') {
          writeSuccessAndExit(resultFile, { action: currentDef.key }, exit);
          return;
        }

        // Enter edit mode for regular settings
        setEditingKey(currentDef.key);
        setMode('edit');
        // Set initial value based on current setting
        const currentValue = settings[currentDef.key as keyof DmuxSettings];
        if (currentDef.type === 'boolean') {
          setEditingValueIndex(currentValue ? 0 : 1);
        } else if (currentDef.type === 'select' && currentDef.options) {
          const optIndex = currentDef.options.findIndex(o => o.value === currentValue);
          setEditingValueIndex(Math.max(0, optIndex));
        } else if (currentDef.type === 'text') {
          setTextValue(typeof currentValue === 'string' ? currentValue : '');
        }
      } else if (mode === 'edit') {
        // Go to scope selection
        setMode('scope');
        setScopeIndex(0);
      } else if (mode === 'scope') {
        // Save the setting
        const currentDef = settingDefinitions.find(d => d.key === editingKey);
        if (currentDef && currentDef.type !== 'action') {
          const scope = scopeIndex === 0 ? 'global' : 'project';

          // Calculate the new value
          let newValue: any;
          if (currentDef.type === 'boolean') {
            newValue = editingValueIndex === 0;
          } else if (currentDef.type === 'select' && currentDef.options) {
            newValue = currentDef.options[editingValueIndex]?.value || '';
          } else if (currentDef.type === 'text') {
            newValue = textValue;
          }

          writeSuccessAndExit(resultFile, {
            key: currentDef.key,
            value: newValue,
            scope,
          }, exit);
        }
      }
    }
  });

  return (
    <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
      <Box flexDirection="column" paddingX={2} paddingY={1}>
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
                displayValue = String(currentValue) || 'none';
              }

              scopeLabel = isProjectOverride ? ' - project' : (isGlobalSetting ? ' - global' : '');
            }

            return (
              <Box key={def.key}>
                <Text color={isSelected ? POPUP_CONFIG.titleColor : 'white'} bold={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                  {def.label}
                </Text>
                <Text color={isSelected ? POPUP_CONFIG.titleColor : 'gray'} dimColor={!isSelected}>
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
                <Text color={editingValueIndex === 0 ? POPUP_CONFIG.titleColor : 'white'} bold={editingValueIndex === 0}>
                  {editingValueIndex === 0 ? '▶ ' : '  '}Enable
                </Text>
              </Box>
              <Box>
                <Text color={editingValueIndex === 1 ? POPUP_CONFIG.titleColor : 'white'} bold={editingValueIndex === 1}>
                  {editingValueIndex === 1 ? '▶ ' : '  '}Disable
                </Text>
              </Box>
            </>
          )}

          {currentDef.type === 'select' && currentDef.options && (
            <>
              {currentDef.options.map((option, index) => (
                <Box key={option.value}>
                  <Text color={editingValueIndex === index ? POPUP_CONFIG.titleColor : 'white'} bold={editingValueIndex === index}>
                    {editingValueIndex === index ? '▶ ' : '  '}{option.label}
                  </Text>
                </Box>
              ))}
            </>
          )}

          {currentDef.type === 'text' && (
            <Box>
              <Text>{'> '}</Text>
              <TextInput
                value={textValue}
                onChange={setTextValue}
                onSubmit={() => { setMode('scope'); setScopeIndex(0); }}
                placeholder="Leave empty for default"
              />
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>{currentDef.type === 'text' ? 'Type a value • Enter to confirm • ESC to back' : '↑↓ to navigate • Enter to select • ESC to back'}</Text>
          </Box>
        </>
      )}

      {mode === 'scope' && currentDef && (
        <>
          <Box marginBottom={1}>
            <Text bold>Save {currentDef.label} as:</Text>
          </Box>

          <Box>
            <Text color={scopeIndex === 0 ? POPUP_CONFIG.titleColor : 'white'} bold={scopeIndex === 0}>
              {scopeIndex === 0 ? '▶ ' : '  '}Global (all projects)
            </Text>
          </Box>
          <Box>
            <Text color={scopeIndex === 1 ? POPUP_CONFIG.titleColor : 'white'} bold={scopeIndex === 1}>
              {scopeIndex === 1 ? '▶ ' : '  '}Project only
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text dimColor>↑↓ to navigate • Enter to save • ESC to back</Text>
          </Box>
        </>
      )}
      </Box>
    </PopupWrapper>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const settingsJson = process.argv[3];

  if (!resultFile || !settingsJson) {
    console.error('Error: Result file and settings JSON required');
    process.exit(1);
  }

  let data: {
    settingDefinitions: SettingDefinition[];
    settings: DmuxSettings;
    globalSettings: DmuxSettings;
    projectSettings: DmuxSettings;
  };

  try {
    data = JSON.parse(settingsJson);
  } catch (error) {
    console.error('Error: Failed to parse settings JSON');
    process.exit(1);
  }

  render(
    <SettingsPopupApp
      resultFile={resultFile}
      settingDefinitions={data.settingDefinitions}
      settings={data.settings}
      globalSettings={data.globalSettings}
      projectSettings={data.projectSettings}
    />
  );
}

main();
