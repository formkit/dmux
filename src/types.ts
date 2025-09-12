export interface DmuxPane {
  id: string;
  slug: string;
  prompt: string;
  paneId: string;
  worktreePath?: string;
  testWindowId?: string;  // Background window for tests
  testStatus?: 'running' | 'passed' | 'failed';
  testOutput?: string;
  devWindowId?: string;   // Background window for dev server
  devStatus?: 'running' | 'stopped';
  devUrl?: string;        // Detected dev server URL
  agent?: 'claude' | 'opencode';
  agentStatus?: 'working' | 'waiting' | 'idle';  // Agent working/attention status
  lastAgentCheck?: number;  // Timestamp of last status check
}

export interface PanePosition {
  paneId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ProjectSettings {
  testCommand?: string;
  devCommand?: string;
  firstTestRun?: boolean;  // Track if test has been run before
  firstDevRun?: boolean;   // Track if dev has been run before
}

export interface DmuxAppProps {
  panesFile: string;
  projectName: string;
  sessionName: string;
  projectRoot?: string;
  settingsFile: string;
  autoUpdater?: any; // AutoUpdater instance
}
