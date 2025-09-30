import { EventEmitter } from 'events';
import type { DmuxPane, ProjectSettings } from '../types.js';

export interface DmuxState {
  panes: DmuxPane[];
  projectName: string;
  sessionName: string;
  projectRoot: string;
  settings: ProjectSettings;
  serverPort?: number;
  serverUrl?: string;
}

export class StateManager extends EventEmitter {
  private static instance: StateManager;
  private state: DmuxState;
  private updateCallbacks: Set<(state: DmuxState) => void> = new Set();

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

  updateProjectInfo(projectName: string, sessionName: string, projectRoot: string): void {
    this.state.projectName = projectName;
    this.state.sessionName = sessionName;
    this.state.projectRoot = projectRoot;
    this.notifyListeners();
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