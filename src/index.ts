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
import DmuxApp from './DmuxApp.js';
import { AutoUpdater } from './AutoUpdater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Dmux {
  private panesFile: string;
  private settingsFile: string;
  private projectName: string;
  private sessionName: string;
  private projectRoot: string;
  private autoUpdater: AutoUpdater;
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
    
    // Store config in parent directory alongside worktrees
    const parentDir = path.dirname(this.projectRoot);
    const configFile = path.join(parentDir, 'dmux.config.json');
    
    // Always use the parent directory config location
    this.panesFile = configFile;
    this.settingsFile = configFile; // Same file for all config
    
    // Initialize auto-updater with config file
    this.autoUpdater = new AutoUpdater(configFile);
  }

  async init() {
    // Check for migration from old config location
    await this.migrateOldConfig();
    
    // Initialize config file if it doesn't exist
    if (!await this.fileExists(this.panesFile)) {
      const initialConfig = {
        projectName: this.projectName,
        projectRoot: this.projectRoot,
        panes: [],
        settings: {},
        lastUpdated: new Date().toISOString()
      };
      await fs.writeFile(this.panesFile, JSON.stringify(initialConfig, null, 2));
    }

    // Check for updates in background if needed
    this.checkForUpdatesBackground();

    const inTmux = process.env.TMUX !== undefined;
    
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
        execSync(`tmux select-pane -t ${this.sessionName} -T "dmux-${this.projectName}"`, { stdio: 'inherit' });
        // Send dmux command to the new session
        execSync(`tmux send-keys -t ${this.sessionName} "dmux" Enter`, { stdio: 'inherit' });
      }
      execSync(`tmux attach-session -t ${this.sessionName}`, { stdio: 'inherit' });
      return;
    }

    // Enable pane borders to show titles
    try {
      execSync(`tmux set-option pane-border-status top`, { stdio: 'pipe' });
    } catch {
      // Ignore if it fails
    }

    // Set pane title for the current pane running dmux
    try {
      execSync(`tmux select-pane -T "dmux-${this.projectName}"`, { stdio: 'pipe' });
    } catch {
      // Ignore if it fails (might not have permission or tmux version doesn't support it)
    }
    
    // Launch the Ink app
    render(React.createElement(DmuxApp, {
      panesFile: this.panesFile,
      settingsFile: this.settingsFile,
      projectName: this.projectName,
      sessionName: this.sessionName,
      projectRoot: this.projectRoot,
      autoUpdater: this.autoUpdater
    }));
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
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
      // Try to get git root directory
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

  private async migrateOldConfig() {
    // Check if we're using the new config location
    const parentDir = path.dirname(this.projectRoot);
    const newConfigFile = path.join(parentDir, 'dmux.config.json');
    const dmuxDir = path.join(process.env.HOME!, '.dmux');
    
    if (this.panesFile === newConfigFile && !await this.fileExists(newConfigFile)) {
      // Look for old config files to migrate
      const projectHash = createHash('md5').update(this.projectRoot).digest('hex').substring(0, 8);
      const projectIdentifier = `${this.projectName}-${projectHash}`;
      const oldPanesFile = path.join(dmuxDir, `${projectIdentifier}-panes.json`);
      const oldSettingsFile = path.join(dmuxDir, `${projectIdentifier}-settings.json`);
      const oldUpdateSettingsFile = path.join(dmuxDir, 'update-settings.json');
      
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
}

const dmux = new Dmux();
dmux.init().catch(() => process.exit(1));