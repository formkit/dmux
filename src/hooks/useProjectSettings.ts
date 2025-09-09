import { useEffect, useState } from 'react';
import fs from 'fs/promises';
import type { ProjectSettings } from '../types.js';

export default function useProjectSettings(settingsFile: string) {
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({});

  useEffect(() => {
    const load = async () => {
      try {
        const content = await fs.readFile(settingsFile, 'utf-8');
        const settings = JSON.parse(content) as ProjectSettings;
        setProjectSettings(settings);
      } catch {
        setProjectSettings({});
      }
    };
    load();
  }, [settingsFile]);

  const saveSettings = async (settings: ProjectSettings) => {
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
    setProjectSettings(settings);
  };

  return { projectSettings, saveSettings };
}
