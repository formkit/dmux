#!/usr/bin/env node

import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { render } from 'ink';
import React from 'react';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import DmuxApp from './DmuxApp.js';
import { AutoUpdater } from './AutoUpdater.js';
import readline from 'readline';
import { DmuxServer } from './server/index.js';
import { StateManager } from './shared/StateManager.js';
import { LogService } from './services/LogService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

class Dmux {
  private panesFile: string;
  private settingsFile: string;
  private projectName: string;
  private sessionName: string;
  private projectRoot: string;
  private autoUpdater: AutoUpdater;
  private server: DmuxServer;
  private stateManager: StateManager;
  private static cachedProjectRoot: string | null = null;

  constructor() {
    // Get git root directory to determine project scope (cached)
    this.projectRoot = this.getProjectRoot();
    // Get project name from git root directory
    this.projectName = path.basename(this.projectRoot);

    // Create a unique identifier for this project based on its full path
    // This ensures different projects with the same folder name are kept separate
    const projectHash = createHash('md5').update(this.projectRoot).digest('hex').substring(0, 8);
    const projectIdentifier = `${this.projectName}-${projectHash}`;

    // Create unique session name for this project (sanitize for tmux compatibility)
    // tmux converts dots to underscores, so we do it explicitly to avoid mismatches
    const sanitizedProjectIdentifier = projectIdentifier.replace(/\./g, '-');
    this.sessionName = `dmux-${sanitizedProjectIdentifier}`;

    // Store config in .dmux directory inside project root
    const dmuxDir = path.join(this.projectRoot, '.dmux');
    const configFile = path.join(dmuxDir, 'dmux.config.json');

    // Always use the .dmux directory config location
    this.panesFile = configFile;
    this.settingsFile = configFile; // Same file for all config

    // Initialize auto-updater with config file
    this.autoUpdater = new AutoUpdater(configFile);

    // Initialize server and state manager
    this.server = new DmuxServer();
    this.stateManager = StateManager.getInstance();
  }

  async init() {
    // Set up global signal handlers for clean exit
    this.setupGlobalSignalHandlers();

    // Ensure .dmux directory exists and is in .gitignore
    await this.ensureDmuxDirectory();

    // Check for migration from old config location
    await this.migrateOldConfig();

    // Initialize config file if it doesn't exist
    if (!await this.fileExists(this.panesFile)) {
      const initialConfig = {
        projectName: this.projectName,
        projectRoot: this.projectRoot,
        panes: [],
        settings: {},
        lastUpdated: new Date().toISOString(),
        controlPaneId: undefined,
        controlPaneSize: 40  // Sidebar width
      };
      await fs.writeFile(this.panesFile, JSON.stringify(initialConfig, null, 2));
    }

    // Check for updates in background if needed
    this.checkForUpdatesBackground();

    const inTmux = process.env.TMUX !== undefined;
    const isDev = process.env.DMUX_DEV === 'true';

    if (!inTmux) {
      // Check if project-specific session already exists
      try {
        execSync(`tmux has-session -t ${this.sessionName} 2>/dev/null`, { stdio: 'pipe' });
        // Session exists, will attach
      } catch {
        // Create new session
        // Create new session first
        execSync(`tmux new-session -d -s ${this.sessionName}`, { stdio: 'inherit' });
        // Enable pane borders to show titles
        execSync(`tmux set-option -t ${this.sessionName} pane-border-status top`, { stdio: 'inherit' });
        // Set pane title for the main dmux pane
        execSync(`tmux select-pane -t ${this.sessionName} -T "dmux v${packageJson.version} - ${this.projectName}"`, { stdio: 'inherit' });
        // Send dmux command to the new session (use dev command if in dev mode)
        // In dev mode, use current directory if we're in a worktree, otherwise use projectRoot
        let devDirectory = this.projectRoot;
        if (isDev && this.isWorktree()) {
          devDirectory = process.cwd();
        }
        const dmuxCommand = isDev ? `cd "${devDirectory}" && pnpm dev:watch` : 'dmux';
        execSync(`tmux send-keys -t ${this.sessionName} "${dmuxCommand}" Enter`, { stdio: 'inherit' });
      }
      execSync(`tmux attach-session -t ${this.sessionName}`, { stdio: 'inherit' });
      return;
    }

    // Enable pane borders to show titles
    // NOTE: Temporarily disabled to test if border updates cause UI shifts
    // try {
    //   execSync(`tmux set-option pane-border-status top`, { stdio: 'pipe' });
    // } catch {
    //   // Ignore if it fails
    // }

    // Set pane title for the current pane running dmux
    // NOTE: Temporarily disabled to test if title updates cause UI shifts
    // try {
    //   execSync(`tmux select-pane -T "dmux v${packageJson.version} - ${this.projectName}"`, { stdio: 'pipe' });
    // } catch {
    //   // Ignore if it fails (might not have permission or tmux version doesn't support it)
    // }

    // Get current pane ID (control pane for left sidebar)
    let controlPaneId: string | undefined;
    const SIDEBAR_WIDTH = 40;

    try {
      // Get control pane ID
      controlPaneId = execSync('tmux display-message -p "#{pane_id}"', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();

      // Load existing config to check if control pane is already set
      const configContent = await fs.readFile(this.panesFile, 'utf-8');
      const config = JSON.parse(configContent);

      // Only set up sidebar if not already configured
      if (!config.controlPaneId) {
        // Update config with control pane info
        config.controlPaneId = controlPaneId;
        config.controlPaneSize = SIDEBAR_WIDTH;
        config.lastUpdated = new Date().toISOString();

        await fs.writeFile(this.panesFile, JSON.stringify(config, null, 2));
      } else {
        // Use existing config value
        controlPaneId = config.controlPaneId;
      }
    } catch (error) {
      // Ignore errors in sidebar setup - will work without it
      LogService.getInstance().error('Failed to set up sidebar layout', 'Setup', undefined, error instanceof Error ? error : undefined);
    }

    // Update state manager with project info
    this.stateManager.updateProjectInfo(this.projectName, this.sessionName, this.projectRoot, this.panesFile);

    // Start the HTTP server
    let serverInfo: { port: number; url: string; tunnelUrl?: string } = { port: 0, url: '' };
    try {
      serverInfo = await this.server.start();
      // Update StateManager with server info
      this.stateManager.updateServerInfo(serverInfo.port, serverInfo.url);
      // Don't log the local URL - tunnel will be created on demand when "r" is pressed
    } catch (err) {
      LogService.getInstance().error('Failed to start HTTP server', 'Setup', undefined, err instanceof Error ? err : undefined);
      // Continue without server - not critical for main functionality
    }

    // Add test logs to verify logging system functionality
    const logService = LogService.getInstance();
    logService.debug(`dmux started for project: ${this.projectName}`, 'startup');
    logService.debug(`Project root: ${this.projectRoot}`, 'startup');
    logService.debug(`HTTP server running on port ${serverInfo.port}`, 'startup');
    logService.debug('Debug log: System initialized successfully', 'startup');

    // Add a sample warning and error for testing
    if (process.env.DMUX_DEV === 'true') {
      logService.debug('Development mode enabled - this is a test warning', 'startup');
      logService.debug('Press [l] to view logs, [L] to reset layout', 'startup');
    }

    // Suppress console output from LogService to prevent interference with Ink UI
    LogService.getInstance().setSuppressConsole(true);

    // Clear screen before launching Ink - minimal clearing to avoid artifacts
    // Don't use \x1b[3J as it can cause layout shifts
    process.stdout.write('\x1b[2J\x1b[H');  // Clear screen and move cursor to home

    // Ensure cursor is truly at home position and scrollback is clear
    process.stdout.write('\x1b[1;1H');  // Force cursor to row 1, column 1

    // Small delay to let terminal settle
    await new Promise(resolve => setTimeout(resolve, 50));

    // Launch the Ink app
    const app = render(React.createElement(DmuxApp, {
      panesFile: this.panesFile,
      settingsFile: this.settingsFile,
      projectName: this.projectName,
      sessionName: this.sessionName,
      projectRoot: this.projectRoot,
      autoUpdater: this.autoUpdater,
      serverPort: serverInfo.port,
      server: this.server,
      controlPaneId
    }), {
      exitOnCtrlC: false  // Disable automatic exit on Ctrl+C
    });

    // Clean shutdown on app exit
    app.waitUntilExit().then(async () => {
      await this.server.stop();
      process.exit(0);
    });
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private isWorktree(): boolean {
    try {
      // Check if current directory is different from project root
      const cwd = process.cwd();
      if (cwd === this.projectRoot) {
        return false;
      }

      // Check if we're in a git worktree by checking if .git is a file (not a directory)
      const gitPath = path.join(cwd, '.git');
      if (fsSync.existsSync(gitPath)) {
        const stats = fsSync.statSync(gitPath);
        // In a worktree, .git is a file, not a directory
        return stats.isFile();
      }

      return false;
    } catch {
      return false;
    }
  }

  private getProjectRoot(): string {
    // Return cached value if available
    if (Dmux.cachedProjectRoot) {
      return Dmux.cachedProjectRoot;
    }

    try {
      // First, try to get the main worktree if we're in a git repository
      // This ensures we always use the main repository root, even when run from a worktree
      const worktreeList = execSync('git worktree list --porcelain', {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      // The first line contains the main worktree path
      const mainWorktreeLine = worktreeList.split('\n')[0];
      if (mainWorktreeLine && mainWorktreeLine.startsWith('worktree ')) {
        const mainWorktreePath = mainWorktreeLine.substring(9).trim();
        Dmux.cachedProjectRoot = mainWorktreePath;
        return mainWorktreePath;
      }

      // Fallback to git rev-parse if worktree list fails
      const gitRoot = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
      Dmux.cachedProjectRoot = gitRoot;
      return gitRoot;
    } catch {
      // Fallback to current directory if not in a git repo
      const cwd = process.cwd();
      Dmux.cachedProjectRoot = cwd;
      return cwd;
    }
  }

  private async ensureDmuxDirectory() {
    const dmuxDir = path.join(this.projectRoot, '.dmux');
    const worktreesDir = path.join(dmuxDir, 'worktrees');

    // Create .dmux directory if it doesn't exist
    if (!await this.fileExists(dmuxDir)) {
      await fs.mkdir(dmuxDir, { recursive: true });
    }

    // Create worktrees directory if it doesn't exist
    if (!await this.fileExists(worktreesDir)) {
      await fs.mkdir(worktreesDir, { recursive: true });
    }

    // Check if .gitignore exists and if .dmux is in it
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    if (await this.fileExists(gitignorePath)) {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      const lines = gitignoreContent.split('\n');
      const hasDmuxEntry = lines.some(line =>
        line.trim() === '.dmux' ||
        line.trim() === '.dmux/' ||
        line.trim() === '/.dmux' ||
        line.trim() === '/.dmux/'
      );

      if (!hasDmuxEntry) {
        // Prompt user to add .dmux to .gitignore
        const shouldAdd = await this.promptUser(
          'The .dmux directory is not in .gitignore. Would you like to add it? (y/n): '
        );

        if (shouldAdd) {
          // Add .dmux to .gitignore
          const newGitignore = gitignoreContent.endsWith('\n')
            ? gitignoreContent + '.dmux/\n'
            : gitignoreContent + '\n.dmux/\n';
          await fs.writeFile(gitignorePath, newGitignore);
        }
      }
    } else {
      // No .gitignore exists, prompt to create one
      const shouldCreate = await this.promptUser(
        'No .gitignore file found. Would you like to create one with .dmux/ entry? (y/n): '
      );

      if (shouldCreate) {
        await fs.writeFile(gitignorePath, '.dmux/\n');
      }
    }
  }

  private async promptUser(question: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  private async migrateOldConfig() {
    // Check if we're using the new config location
    const dmuxDir = path.join(this.projectRoot, '.dmux');
    const newConfigFile = path.join(dmuxDir, 'dmux.config.json');
    const oldParentConfigFile = path.join(path.dirname(this.projectRoot), 'dmux.config.json');
    const homeDmuxDir = path.join(process.env.HOME!, '.dmux');

    if (this.panesFile === newConfigFile && !await this.fileExists(newConfigFile)) {
      // Look for old config files to migrate
      const projectHash = createHash('md5').update(this.projectRoot).digest('hex').substring(0, 8);
      const projectIdentifier = `${this.projectName}-${projectHash}`;
      const oldPanesFile = path.join(homeDmuxDir, `${projectIdentifier}-panes.json`);
      const oldSettingsFile = path.join(homeDmuxDir, `${projectIdentifier}-settings.json`);
      const oldUpdateSettingsFile = path.join(homeDmuxDir, 'update-settings.json');
      
      let panes = [];
      let settings = {};
      let updateSettings = {};
      
      // Try to read old panes file
      if (await this.fileExists(oldPanesFile)) {
        try {
          const oldPanesContent = await fs.readFile(oldPanesFile, 'utf-8');
          panes = JSON.parse(oldPanesContent);
        } catch {}
      }
      
      // Try to read old settings file
      if (await this.fileExists(oldSettingsFile)) {
        try {
          const oldSettingsContent = await fs.readFile(oldSettingsFile, 'utf-8');
          settings = JSON.parse(oldSettingsContent);
        } catch {}
      }
      
      // Try to read old update settings file
      if (await this.fileExists(oldUpdateSettingsFile)) {
        try {
          const oldUpdateContent = await fs.readFile(oldUpdateSettingsFile, 'utf-8');
          updateSettings = JSON.parse(oldUpdateContent);
        } catch {}
      }
      
      // Check for config from previous parent directory location
      if (await this.fileExists(oldParentConfigFile)) {
        try {
          const oldConfig = JSON.parse(await fs.readFile(oldParentConfigFile, 'utf-8'));
          if (oldConfig.panes) panes = oldConfig.panes;
          if (oldConfig.settings) settings = oldConfig.settings;
          if (oldConfig.updateSettings) updateSettings = oldConfig.updateSettings;
        } catch {}
      }

      // If we found old config, migrate it
      if (panes.length > 0 || Object.keys(settings).length > 0 || Object.keys(updateSettings).length > 0) {
        const migratedConfig = {
          projectName: this.projectName,
          projectRoot: this.projectRoot,
          panes: panes,
          settings: settings,
          updateSettings: updateSettings,
          lastUpdated: new Date().toISOString(),
          migratedFrom: 'dmux-legacy'
        };
        await fs.writeFile(newConfigFile, JSON.stringify(migratedConfig, null, 2));

        // Clean up old files after successful migration
        try {
          await fs.unlink(oldPanesFile);
        } catch {}
        try {
          await fs.unlink(oldSettingsFile);
        } catch {}
        try {
          await fs.unlink(oldUpdateSettingsFile);
        } catch {}
        try {
          await fs.unlink(oldParentConfigFile);
        } catch {}
      }
    }
  }

  private checkForUpdatesBackground() {
    // Run update check in background without blocking startup
    setImmediate(async () => {
      try {
        const shouldCheck = await this.autoUpdater.shouldCheckForUpdates();
        if (shouldCheck) {
          // Check for updates asynchronously
          this.autoUpdater.checkForUpdates().catch(() => {
            // Silently ignore update check failures
          });
        }
      } catch {
        // Silently ignore errors in background update check
      }
    });
  }

  async getUpdateInfo() {
    return await this.autoUpdater.checkForUpdates();
  }

  async performUpdate() {
    const updateInfo = await this.autoUpdater.checkForUpdates();
    return await this.autoUpdater.performUpdate(updateInfo);
  }

  async skipUpdate(version: string) {
    return await this.autoUpdater.skipVersion(version);
  }

  getAutoUpdater() {
    return this.autoUpdater;
  }

  private setupGlobalSignalHandlers() {
    const cleanTerminalExit = () => {
      // Clear screen multiple times to ensure no artifacts
      process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and move to home
      process.stdout.write('\x1b[3J'); // Clear scrollback buffer
      process.stdout.write('\n'.repeat(100)); // Push any remaining content off screen

      // Clear tmux pane if we're in tmux
      if (process.env.TMUX) {
        try {
          execSync('tmux clear-history', { stdio: 'pipe' });
          execSync('tmux send-keys C-l', { stdio: 'pipe' });
        } catch {}
      }

      // Wait a moment for clearing to settle, then show goodbye message
      setTimeout(() => {
        process.stdout.write('\x1b[2J\x1b[H');
        process.stdout.write('\n\n  dmux session ended.\n\n');
        process.exit(0);
      }, 100);
    };

    // Handle Ctrl+C and SIGTERM
    process.on('SIGINT', cleanTerminalExit);
    process.on('SIGTERM', cleanTerminalExit);

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      cleanTerminalExit();
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      cleanTerminalExit();
    });
  }
}

const dmux = new Dmux();
dmux.init().catch(() => process.exit(1));