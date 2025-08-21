#!/usr/bin/env node

import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { render } from 'ink';
import React from 'react';
import { createHash } from 'crypto';
import DmuxApp from './DmuxApp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Dmux {
  private dmuxDir: string;
  private panesFile: string;
  private settingsFile: string;
  private projectName: string;
  private sessionName: string;
  private projectRoot: string;

  constructor() {
    this.dmuxDir = path.join(process.env.HOME!, '.dmux');
    // Get git root directory to determine project scope
    this.projectRoot = this.getProjectRoot();
    // Get project name from git root directory
    this.projectName = path.basename(this.projectRoot);
    
    // Create a unique identifier for this project based on its full path
    // This ensures different projects with the same folder name are kept separate
    const projectHash = createHash('md5').update(this.projectRoot).digest('hex').substring(0, 8);
    const projectIdentifier = `${this.projectName}-${projectHash}`;
    
    // Create unique session name for this project
    this.sessionName = `dmux-${projectIdentifier}`;
    // Store panes per project using the unique identifier
    this.panesFile = path.join(this.dmuxDir, `${projectIdentifier}-panes.json`);
    // Store project settings (test/dev commands) per project
    this.settingsFile = path.join(this.dmuxDir, `${projectIdentifier}-settings.json`);
  }

  async init() {
    await fs.mkdir(this.dmuxDir, { recursive: true });
    
    if (!await this.fileExists(this.panesFile)) {
      await fs.writeFile(this.panesFile, '[]');
    }

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
      dmuxDir: this.dmuxDir,
      panesFile: this.panesFile,
      settingsFile: this.settingsFile,
      projectName: this.projectName,
      sessionName: this.sessionName,
      projectRoot: this.projectRoot
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
    try {
      // Try to get git root directory
      const gitRoot = execSync('git rev-parse --show-toplevel', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
      return gitRoot;
    } catch {
      // Fallback to current directory if not in a git repo
      return process.cwd();
    }
  }
}

const dmux = new Dmux();
dmux.init().catch(() => process.exit(1));