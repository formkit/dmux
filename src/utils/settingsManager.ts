import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { DmuxSettings, SettingsScope, SettingDefinition } from '../types.js';

const GLOBAL_SETTINGS_PATH = join(homedir(), '.dmux.global.json');

export const SETTING_DEFINITIONS: SettingDefinition[] = [
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
      { value: 'claude', label: 'Claude Code' },
      { value: 'opencode', label: 'OpenCode' },
    ],
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

  /**
   * Get merged settings (project settings override global)
   */
  getSettings(): DmuxSettings {
    return {
      ...this.globalSettings,
      ...this.projectSettings,
    };
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
    if (scope === 'global') {
      this.globalSettings = { ...this.globalSettings, ...settings };
      this.saveGlobalSettings();
    } else {
      this.projectSettings = { ...this.projectSettings, ...settings };
      this.saveProjectSettings();
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
    return key in this.projectSettings;
  }

  /**
   * Get the effective scope for a setting (where it's currently defined)
   */
  getEffectiveScope(key: keyof DmuxSettings): SettingsScope | null {
    if (key in this.projectSettings) return 'project';
    if (key in this.globalSettings) return 'global';
    return null;
  }
}
