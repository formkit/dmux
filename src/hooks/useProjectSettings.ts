import { useEffect, useState } from 'react';
import fs from 'fs/promises';
import type { ProjectSettings } from '../types.js';

// Config structure matching what we save
interface DmuxConfig {
  projectName?: string;
  projectRoot?: string;
  panes?: any[];
  settings?: ProjectSettings;
  lastUpdated?: string;
}

export default function useProjectSettings(settingsFile: string) {
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({});

  useEffect(() => {
    const load = async () => {
      try {
        const content = await fs.readFile(settingsFile, 'utf-8');
        const parsed = JSON.parse(content);
        
        // Handle both old format (direct settings) and new format (config with settings field)
        if (parsed.settings !== undefined || parsed.panes !== undefined) {
          // New config format
          const config = parsed as DmuxConfig;
          setProjectSettings(config.settings || {});
        } else {
          // Old format or direct settings
          setProjectSettings(parsed as ProjectSettings);
        }
      } catch {
        setProjectSettings({});
      }
    };
    load();
  }, [settingsFile]);

  const saveSettings = async (settings: ProjectSettings) => {
    // Read existing config to preserve other fields
    let config: DmuxConfig = {};
    try {
      const content = await fs.readFile(settingsFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.panes !== undefined || parsed.settings !== undefined) {
        config = parsed;
      }
    } catch {}
    
    // Update settings in config
    config.settings = settings;
    config.lastUpdated = new Date().toISOString();
    
    await fs.writeFile(settingsFile, JSON.stringify(config, null, 2));
    setProjectSettings(settings);
  };

  return { projectSettings, saveSettings };
}
