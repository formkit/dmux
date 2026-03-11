import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { DmuxSettings, SettingsScope, SettingDefinition } from '../types.js';
import {
  DEFAULT_MIN_PANE_WIDTH,
  DEFAULT_MAX_PANE_WIDTH,
  MAX_MIN_PANE_WIDTH,
  MAX_MAX_PANE_WIDTH,
  MIN_MIN_PANE_WIDTH,
  MIN_MAX_PANE_WIDTH,
  SHIFT_MIN_PANE_WIDTH_STEP,
  SHIFT_MAX_PANE_WIDTH_STEP,
} from '../constants/layout.js';
import { isValidBranchName } from './git.js';
import {
  getAgentDefinitions,
  getDefaultEnabledAgents,
  isAgentName,
  type AgentName,
} from './agentLaunch.js';

const GLOBAL_SETTINGS_PATH = join(homedir(), '.dmux.global.json');
const PERMISSION_MODES = ['', 'plan', 'acceptEdits', 'bypassPermissions'] as const;
function isPermissionMode(value: string): value is NonNullable<DmuxSettings['permissionMode']> {
  return (PERMISSION_MODES as readonly string[]).includes(value);
}

function isValidMaxPaneWidth(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_MAX_PANE_WIDTH &&
    value <= MAX_MAX_PANE_WIDTH
  );
}

function isValidMinPaneWidth(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_MIN_PANE_WIDTH &&
    value <= MAX_MIN_PANE_WIDTH
  );
}

const DEFAULT_SETTINGS: DmuxSettings = {
  // Most permissive defaults for new dmux setups.
  permissionMode: 'bypassPermissions',
  enableAutopilotByDefault: true,
  promptForGitOptionsOnCreate: false,
  minPaneWidth: DEFAULT_MIN_PANE_WIDTH,
  maxPaneWidth: DEFAULT_MAX_PANE_WIDTH,
  enabledAgents: getDefaultEnabledAgents(),
};

const AGENT_OPTIONS = getAgentDefinitions().map((agent) => ({
  value: agent.id,
  label: agent.name,
}));

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'permissionMode',
    label: 'Agent Permission Mode',
    description: 'Controls how much permission is granted to launched agents',
    type: 'select',
    options: [
      { value: '', label: 'Agent default (ask)' },
      { value: 'plan', label: 'Plan mode (Claude only)' },
      { value: 'acceptEdits', label: 'Accept edits' },
      { value: 'bypassPermissions', label: 'Bypass permissions (max autonomy)' },
    ],
  },
  {
    key: 'enableAutopilotByDefault',
    label: 'Enable Autopilot by Default',
    description: 'Automatically accept options when no risk is detected for new panes',
    type: 'boolean',
  },
  {
    key: 'defaultAgent',
    label: 'Default Agent',
    description: 'Skip agent selection and use this agent for all new panes',
    type: 'select',
    options: [
      { value: '', label: 'Ask each time' },
      ...AGENT_OPTIONS,
    ],
  },
  {
    key: 'enabledAgents' as any,
    label: 'Enabled Agents',
    description: 'Select which agents appear in the new pane selection list',
    type: 'action' as any,
  },
  {
    key: 'useTmuxHooks',
    label: 'Use Tmux Hooks',
    description: 'Use tmux hooks for event-driven updates (lower CPU). If disabled, uses polling in a worker thread.',
    type: 'boolean',
  },
  {
    key: 'baseBranch',
    label: 'Base Branch',
    description: 'Branch to create new worktrees from. Leave empty to use current HEAD.',
    type: 'text',
  },
  {
    key: 'branchPrefix',
    label: 'Branch Name Prefix',
    description: 'Prefix for new branch names (e.g. "feat/" produces branch "feat/fix-auth"). Leave empty for no prefix.',
    type: 'select',
    options: [
      { value: '', label: 'No prefix (default)' },
      { value: 'feat/', label: 'feat/' },
      { value: 'fix/', label: 'fix/' },
      { value: 'chore/', label: 'chore/' },
    ],
  },
  {
    key: 'promptForGitOptionsOnCreate',
    label: 'Ask Git Options on Create',
    description: 'When enabled, new-pane popup asks for optional base branch and branch/worktree name overrides.',
    type: 'boolean',
  },
  {
    key: 'minPaneWidth',
    label: 'Min Pane Width',
    description: 'Global minimum content-pane width in characters used during layout fitting.',
    type: 'number',
    min: MIN_MIN_PANE_WIDTH,
    max: MAX_MIN_PANE_WIDTH,
    step: 1,
    shiftStep: SHIFT_MIN_PANE_WIDTH_STEP,
  },
  {
    key: 'maxPaneWidth',
    label: 'Max Pane Width',
    description: 'Global maximum content-pane width in characters before wrapping/spacer logic.',
    type: 'number',
    min: MIN_MAX_PANE_WIDTH,
    max: MAX_MAX_PANE_WIDTH,
    step: 1,
    shiftStep: SHIFT_MAX_PANE_WIDTH_STEP,
  },
  {
    key: 'hooks' as any,
    label: 'Manage Hooks',
    description: 'View and edit dmux lifecycle hooks',
    type: 'action' as any,
  },
];

export class SettingsManager {
  private globalPath: string;
  private projectPath: string;
  private globalSettings: DmuxSettings = {};
  private projectSettings: DmuxSettings = {};

  constructor(projectRoot?: string) {
    this.globalPath = GLOBAL_SETTINGS_PATH;
    this.projectPath = join(projectRoot || process.cwd(), '.dmux', 'settings.json');
    this.loadSettings();
  }

  private loadSettings(): void {
    // Load global settings
    if (existsSync(this.globalPath)) {
      try {
        const data = readFileSync(this.globalPath, 'utf-8');
        this.globalSettings = JSON.parse(data);
      } catch (error) {
        console.error('Failed to load global settings:', error);
      }
    }

    // Load project settings
    if (existsSync(this.projectPath)) {
      try {
        const data = readFileSync(this.projectPath, 'utf-8');
        this.projectSettings = JSON.parse(data);
      } catch (error) {
        console.error('Failed to load project settings:', error);
      }
    }
  }

  private getValidGlobalMinPaneWidth(): number {
    return isValidMinPaneWidth(this.globalSettings.minPaneWidth)
      ? this.globalSettings.minPaneWidth
      : (DEFAULT_SETTINGS.minPaneWidth as number);
  }

  private getValidGlobalMaxPaneWidth(): number {
    return isValidMaxPaneWidth(this.globalSettings.maxPaneWidth)
      ? this.globalSettings.maxPaneWidth
      : (DEFAULT_SETTINGS.maxPaneWidth as number);
  }

  private resolveGlobalPaneWidths(
    overrides?: Partial<Pick<DmuxSettings, 'minPaneWidth' | 'maxPaneWidth'>>
  ): { minPaneWidth: number; maxPaneWidth: number } {
    const hasMinOverride = overrides?.minPaneWidth !== undefined;
    const hasMaxOverride = overrides?.maxPaneWidth !== undefined;

    let minPaneWidth = hasMinOverride
      ? (overrides?.minPaneWidth as number)
      : this.getValidGlobalMinPaneWidth();
    let maxPaneWidth = hasMaxOverride
      ? (overrides?.maxPaneWidth as number)
      : this.getValidGlobalMaxPaneWidth();

    if (minPaneWidth > maxPaneWidth) {
      if (hasMinOverride && !hasMaxOverride) {
        minPaneWidth = maxPaneWidth;
      } else {
        maxPaneWidth = minPaneWidth;
      }
    }

    return { minPaneWidth, maxPaneWidth };
  }

  /**
   * Get merged settings (project settings override global)
   */
  getSettings(): DmuxSettings {
    const merged: DmuxSettings = {
      ...DEFAULT_SETTINGS,
      ...this.globalSettings,
      ...this.projectSettings,
    };

    // Pane width bounds are global-only; ignore any project override values.
    const paneWidths = this.resolveGlobalPaneWidths();
    merged.minPaneWidth = paneWidths.minPaneWidth;
    merged.maxPaneWidth = paneWidths.maxPaneWidth;

    if (Array.isArray(merged.enabledAgents)) {
      merged.enabledAgents = [...merged.enabledAgents];
    }

    return merged;
  }

  /**
   * Get a specific setting value (with project override)
   */
  getSetting<K extends keyof DmuxSettings>(key: K): DmuxSettings[K] {
    const merged = this.getSettings();
    return merged[key];
  }

  /**
   * Get global settings only
   */
  getGlobalSettings(): DmuxSettings {
    return { ...this.globalSettings };
  }

  /**
   * Get project settings only
   */
  getProjectSettings(): DmuxSettings {
    return { ...this.projectSettings };
  }

  /**
   * Update a setting at the specified scope
   */
  updateSetting<K extends keyof DmuxSettings>(
    key: K,
    value: DmuxSettings[K],
    scope: SettingsScope
  ): void {
    // Validate branch-related settings
    if ((key === 'baseBranch' || key === 'branchPrefix') && typeof value === 'string' && value !== '') {
      if (!isValidBranchName(value)) {
        throw new Error(`Invalid ${key}: contains characters not allowed in git branch names`);
      }
    }
    if (key === 'permissionMode' && typeof value === 'string' && !isPermissionMode(value)) {
      throw new Error(`Invalid permissionMode: "${value}"`);
    }
    if (key === 'enabledAgents') {
      if (!Array.isArray(value)) {
        throw new Error('Invalid enabledAgents: expected an array of agent IDs');
      }
      const invalidAgents = value.filter((agent) => !isAgentName(agent));
      if (invalidAgents.length > 0) {
        throw new Error(`Invalid enabledAgents: ${invalidAgents.join(', ')}`);
      }
    }
    if (key === 'minPaneWidth' && !isValidMinPaneWidth(value)) {
      throw new Error(
        `Invalid minPaneWidth: expected an integer between ${MIN_MIN_PANE_WIDTH} and ${MAX_MIN_PANE_WIDTH}`
      );
    }
    if (key === 'maxPaneWidth' && !isValidMaxPaneWidth(value)) {
      throw new Error(
        `Invalid maxPaneWidth: expected an integer between ${MIN_MAX_PANE_WIDTH} and ${MAX_MAX_PANE_WIDTH}`
      );
    }

    // Pane width settings are always stored globally, regardless of requested scope.
    if (key === 'minPaneWidth' || key === 'maxPaneWidth') {
      const paneWidthOverrides: Partial<Pick<DmuxSettings, 'minPaneWidth' | 'maxPaneWidth'>> = {};
      if (key === 'minPaneWidth') {
        paneWidthOverrides.minPaneWidth = value as number;
      } else {
        paneWidthOverrides.maxPaneWidth = value as number;
      }
      const paneWidths = this.resolveGlobalPaneWidths(paneWidthOverrides);
      this.globalSettings.minPaneWidth = paneWidths.minPaneWidth;
      this.globalSettings.maxPaneWidth = paneWidths.maxPaneWidth;

      let projectSettingsChanged = false;
      if (this.projectSettings.minPaneWidth !== undefined) {
        delete this.projectSettings.minPaneWidth;
        projectSettingsChanged = true;
      }
      if (this.projectSettings.maxPaneWidth !== undefined) {
        delete this.projectSettings.maxPaneWidth;
        projectSettingsChanged = true;
      }
      if (projectSettingsChanged) {
        this.saveProjectSettings();
      }
      this.saveGlobalSettings();
      return;
    }

    if (scope === 'global') {
      this.globalSettings[key] = value;
      this.saveGlobalSettings();
    } else {
      this.projectSettings[key] = value;
      this.saveProjectSettings();
    }
  }

  /**
   * Update multiple settings at once
   */
  updateSettings(settings: Partial<DmuxSettings>, scope: SettingsScope): void {
    if (typeof settings.permissionMode === 'string' && !isPermissionMode(settings.permissionMode)) {
      throw new Error(`Invalid permissionMode: "${settings.permissionMode}"`);
    }
    if (settings.enabledAgents !== undefined) {
      if (!Array.isArray(settings.enabledAgents)) {
        throw new Error('Invalid enabledAgents: expected an array of agent IDs');
      }
      const invalidAgents = settings.enabledAgents.filter(
        (agent) => !isAgentName(agent)
      );
      if (invalidAgents.length > 0) {
        throw new Error(`Invalid enabledAgents: ${invalidAgents.join(', ')}`);
      }
      settings.enabledAgents = settings.enabledAgents as AgentName[];
    }
    if (typeof settings.baseBranch === 'string' && settings.baseBranch !== '' && !isValidBranchName(settings.baseBranch)) {
      throw new Error('Invalid baseBranch: contains characters not allowed in git branch names');
    }
    if (typeof settings.branchPrefix === 'string' && settings.branchPrefix !== '' && !isValidBranchName(settings.branchPrefix)) {
      throw new Error('Invalid branchPrefix: contains characters not allowed in git branch names');
    }
    if (settings.minPaneWidth !== undefined && !isValidMinPaneWidth(settings.minPaneWidth)) {
      throw new Error(
        `Invalid minPaneWidth: expected an integer between ${MIN_MIN_PANE_WIDTH} and ${MAX_MIN_PANE_WIDTH}`
      );
    }
    if (settings.maxPaneWidth !== undefined && !isValidMaxPaneWidth(settings.maxPaneWidth)) {
      throw new Error(
        `Invalid maxPaneWidth: expected an integer between ${MIN_MAX_PANE_WIDTH} and ${MAX_MAX_PANE_WIDTH}`
      );
    }

    const settingsToApply: Partial<DmuxSettings> = { ...settings };
    let projectSettingsChanged = false;
    let paneWidthsUpdated = false;

    if (settingsToApply.minPaneWidth !== undefined || settingsToApply.maxPaneWidth !== undefined) {
      const paneWidthOverrides: Partial<Pick<DmuxSettings, 'minPaneWidth' | 'maxPaneWidth'>> = {};
      if (settingsToApply.minPaneWidth !== undefined) {
        paneWidthOverrides.minPaneWidth = settingsToApply.minPaneWidth;
      }
      if (settingsToApply.maxPaneWidth !== undefined) {
        paneWidthOverrides.maxPaneWidth = settingsToApply.maxPaneWidth;
      }
      const paneWidths = this.resolveGlobalPaneWidths(paneWidthOverrides);

      this.globalSettings.minPaneWidth = paneWidths.minPaneWidth;
      this.globalSettings.maxPaneWidth = paneWidths.maxPaneWidth;
      paneWidthsUpdated = true;

      delete settingsToApply.minPaneWidth;
      delete settingsToApply.maxPaneWidth;

      if (this.projectSettings.minPaneWidth !== undefined) {
        delete this.projectSettings.minPaneWidth;
        projectSettingsChanged = true;
      }
      if (this.projectSettings.maxPaneWidth !== undefined) {
        delete this.projectSettings.maxPaneWidth;
        projectSettingsChanged = true;
      }
    }

    const hasRemainingSettings = Object.keys(settingsToApply).length > 0;

    if (scope === 'global') {
      if (hasRemainingSettings) {
        this.globalSettings = { ...this.globalSettings, ...settingsToApply };
      }
      if (hasRemainingSettings || paneWidthsUpdated) {
        this.saveGlobalSettings();
      }
      if (projectSettingsChanged) {
        this.saveProjectSettings();
      }
    } else {
      if (hasRemainingSettings) {
        this.projectSettings = { ...this.projectSettings, ...settingsToApply };
        projectSettingsChanged = true;
      }
      if (projectSettingsChanged) {
        this.saveProjectSettings();
      }
      if (paneWidthsUpdated) {
        this.saveGlobalSettings();
      }
    }
  }

  /**
   * Remove a setting from the specified scope
   */
  removeSetting(key: keyof DmuxSettings, scope: SettingsScope): void {
    if (scope === 'global') {
      delete this.globalSettings[key];
      this.saveGlobalSettings();
    } else {
      delete this.projectSettings[key];
      this.saveProjectSettings();
    }
  }

  private saveGlobalSettings(): void {
    try {
      const dir = dirname(this.globalPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.globalPath, JSON.stringify(this.globalSettings, null, 2));
    } catch (error) {
      console.error('Failed to save global settings:', error);
      throw error;
    }
  }

  private saveProjectSettings(): void {
    try {
      const dir = dirname(this.projectPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.projectPath, JSON.stringify(this.projectSettings, null, 2));
    } catch (error) {
      console.error('Failed to save project settings:', error);
      throw error;
    }
  }

  /**
   * Check if a setting is overridden at the project level
   */
  isProjectOverride(key: keyof DmuxSettings): boolean {
    if (key === 'minPaneWidth' || key === 'maxPaneWidth') {
      return false;
    }
    return key in this.projectSettings;
  }

  /**
   * Get the effective scope for a setting (where it's currently defined)
   */
  getEffectiveScope(key: keyof DmuxSettings): SettingsScope | null {
    if (key === 'minPaneWidth') {
      return this.globalSettings.minPaneWidth !== undefined ? 'global' : null;
    }
    if (key === 'maxPaneWidth') {
      return this.globalSettings.maxPaneWidth !== undefined ? 'global' : null;
    }
    if (key in this.projectSettings) return 'project';
    if (key in this.globalSettings) return 'global';
    return null;
  }
}
