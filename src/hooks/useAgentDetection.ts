import { useEffect, useState } from 'react';
import {
  getInstalledAgents,
} from '../utils/agentDetection.js';
import type { AgentName } from '../utils/agentLaunch.js';

export default function useAgentDetection() {
  const [installedAgents, setInstalledAgents] = useState<AgentName[]>([]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const agents = await getInstalledAgents();
        if (active) {
          setInstalledAgents(agents);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return {
    installedAgents,
    // Backward-compatible alias for older call sites.
    availableAgents: installedAgents,
  };
}
