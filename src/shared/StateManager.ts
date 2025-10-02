import { EventEmitter } from 'events';
import type { DmuxPane, ProjectSettings } from '../types.js';
import { ConfigWatcher } from '../services/ConfigWatcher.js';

export interface DmuxState {
  panes: DmuxPane[];
  projectName: string;
  sessionName: string;
  projectRoot: string;
  settings: ProjectSettings;
  serverPort?: number;
  serverUrl?: string;
  panesFile?: string;
}

export class StateManager extends EventEmitter {
  private static instance: StateManager;
  private state: DmuxState;
  private updateCallbacks: Set<(state: DmuxState) => void> = new Set();
  private configWatcher: ConfigWatcher | null = null;

  private constructor() {
    super();
    this.state = {
      panes: [],
      projectName: '',
      sessionName: '',
      projectRoot: '',
      settings: {}
    };
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  getState(): DmuxState {
    return { ...this.state };
  }

  updatePanes(panes: DmuxPane[]): void {
    this.state.panes = [...panes];
    this.notifyListeners();
  }

  updateProjectInfo(projectName: string, sessionName: string, projectRoot: string, panesFile?: string): void {
    this.state.projectName = projectName;
    this.state.sessionName = sessionName;
    this.state.projectRoot = projectRoot;
    if (panesFile) {
      this.state.panesFile = panesFile;
      this.startWatchingConfig(panesFile);
    }
    this.notifyListeners();
  }

  private startWatchingConfig(panesFile: string): void {
    // Stop existing watcher if any
    if (this.configWatcher) {
      this.configWatcher.stop();
    }

    // Start new watcher
    this.configWatcher = new ConfigWatcher(panesFile);
    this.configWatcher.on('change', (config) => {
      // Update state with new panes from file
      this.state.panes = [...config.panes];
      this.notifyListeners();
    });

    this.configWatcher.start().catch(err => {
      console.error('Failed to start config watcher:', err);
    });
  }

  updateSettings(settings: ProjectSettings): void {
    this.state.settings = { ...settings };
    this.notifyListeners();
  }

  updateServerInfo(port: number, url: string): void {
    this.state.serverPort = port;
    this.state.serverUrl = url;
    this.notifyListeners();
  }

  getPaneById(id: string): DmuxPane | undefined {
    return this.state.panes.find(pane => pane.id === id);
  }

  getPanes(): DmuxPane[] {
    return [...this.state.panes];
  }

  subscribe(callback: (state: DmuxState) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  private notifyListeners(): void {
    const stateCopy = this.getState();
    this.updateCallbacks.forEach(callback => {
      try {
        callback(stateCopy);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    });
    this.emit('stateChange', stateCopy);
  }

  reset(): void {
    // Stop file watcher
    if (this.configWatcher) {
      this.configWatcher.stop();
      this.configWatcher = null;
    }

    this.state = {
      panes: [],
      projectName: '',
      sessionName: '',
      projectRoot: '',
      settings: {}
    };
    this.updateCallbacks.clear();
    this.removeAllListeners();
  }
}

export default StateManager.getInstance();