#!/usr/bin/env node

import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { render } from 'ink';
import React from 'react';
import DmuxApp from './DmuxApp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Dmux {
  private dmuxDir: string;
  private panesFile: string;
  private projectName: string;
  private sessionName: string;

  constructor() {
    this.dmuxDir = path.join(process.env.HOME!, '.dmux');
    // Get project name from current directory
    this.projectName = path.basename(process.cwd());
    // Create unique session name for this project
    this.sessionName = `dmux-${this.projectName}`;
    // Store panes per project
    this.panesFile = path.join(this.dmuxDir, `${this.projectName}-panes.json`);
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
        console.log(chalk.yellow(`Attaching to existing ${this.sessionName} session...`));
      } catch {
        console.log(chalk.yellow(`Creating new tmux session for project: ${this.projectName}...`));
        // Create new session first
        execSync(`tmux new-session -d -s ${this.sessionName}`, { stdio: 'inherit' });
        // Send dmux command to the new session
        execSync(`tmux send-keys -t ${this.sessionName} "dmux" Enter`, { stdio: 'inherit' });
      }
      execSync(`tmux attach-session -t ${this.sessionName}`, { stdio: 'inherit' });
      return;
    }

    // Launch the Ink app
    render(React.createElement(DmuxApp, {
      dmuxDir: this.dmuxDir,
      panesFile: this.panesFile,
      projectName: this.projectName,
      sessionName: this.sessionName
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
}

const dmux = new Dmux();
dmux.init().catch(console.error);