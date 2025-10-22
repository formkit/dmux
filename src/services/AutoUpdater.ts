import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { LogService } from './LogService.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Find package.json by walking up the directory tree
function findPackageJson(): any {
  let currentDir = __dirname;
  while (currentDir !== path.parse(currentDir).root) {
    const packagePath = path.join(currentDir, 'package.json');
    try {
      return require(packagePath);
    } catch {
      // Expected - package.json not found at this level, continue traversing
      currentDir = path.dirname(currentDir);
    }
  }
  throw new Error('Could not find package.json');
}

const packageJson = findPackageJson();

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  packageManager: 'npm' | 'pnpm' | 'yarn' | null;
  installMethod: 'global' | 'local' | 'unknown';
}

interface UpdateSettings {
  lastCheckTime?: number;
  checkIntervalHours?: number;
  skipVersion?: string;
  autoUpdateEnabled?: boolean;
}

export class AutoUpdater {
  private configFile: string;
  private checkIntervalMs: number = 24 * 60 * 60 * 1000; // 24 hours
  private logger = LogService.getInstance();

  constructor(configFile: string) {
    this.configFile = configFile;
  }

  async loadSettings(): Promise<UpdateSettings> {
    try {
      const content = await fs.readFile(this.configFile, 'utf-8');
      const config = JSON.parse(content);
      return config.updateSettings || {
        checkIntervalHours: 24,
        autoUpdateEnabled: true
      };
    } catch (error) {
      this.logger.warn('Failed to load update settings, using defaults', 'AutoUpdater');
      return {
        checkIntervalHours: 24,
        autoUpdateEnabled: true
      };
    }
  }

  async saveSettings(settings: UpdateSettings): Promise<void> {
    let config: any = {};
    try {
      const content = await fs.readFile(this.configFile, 'utf-8');
      config = JSON.parse(content);
    } catch {
      // Expected - config file may not exist yet
    }
    
    config.updateSettings = settings;
    config.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
  }

  async shouldCheckForUpdates(): Promise<boolean> {
    const settings = await this.loadSettings();
    const now = Date.now();
    
    if (!settings.lastCheckTime) {
      return true;
    }

    const intervalMs = (settings.checkIntervalHours || 24) * 60 * 60 * 1000;
    return now - settings.lastCheckTime > intervalMs;
  }

  async getLatestVersion(): Promise<string | null> {
    try {
      // First try using npm view which is usually faster
      const result = execSync(`npm view ${packageJson.name} version`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 10000
      }).trim();
      
      if (result && this.isValidVersion(result)) {
        return result;
      }
    } catch {
      // Fallback to npm registry API
      try {
        const response = await fetch(`https://registry.npmjs.org/${packageJson.name}/latest`, {
          method: 'GET',
          headers: {
            'User-Agent': `${packageJson.name}/${packageJson.version}`
          }
        });
        
        if (response.ok) {
          const data = await response.json() as any;
          if (data.version && this.isValidVersion(data.version)) {
            return data.version;
          }
        }
      } catch {
        // Network error or API unavailable
      }
    }
    
    return null;
  }

  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+/.test(version);
  }

  private compareVersions(current: string, latest: string): boolean {
    const currentParts = current.split('.').map(n => parseInt(n));
    const latestParts = latest.split('.').map(n => parseInt(n));
    
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;
      
      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }
    
    return false;
  }

  async detectInstallMethod(): Promise<{ packageManager: 'npm' | 'pnpm' | 'yarn' | null, installMethod: 'global' | 'local' | 'unknown' }> {
    try {
      // Check if dmux is globally installed and how
      
      // Method 1: Check npm global packages
      try {
        const npmGlobals = execSync('npm list -g --depth=0', {
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        
        if (npmGlobals.includes(`${packageJson.name}@`)) {
          return { packageManager: 'npm', installMethod: 'global' };
        }
      } catch {
        // Expected - npm might not be available or package not globally installed
      }

      // Method 2: Check pnpm global packages
      try {
        const pnpmGlobals = execSync('pnpm list -g --depth=0', {
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        
        if (pnpmGlobals.includes(`${packageJson.name}@`)) {
          return { packageManager: 'pnpm', installMethod: 'global' };
        }
      } catch {
        // Expected - pnpm might not be available or package not globally installed
      }

      // Method 3: Check yarn global packages
      try {
        const yarnGlobals = execSync('yarn global list --depth=0', {
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        
        if (yarnGlobals.includes(`${packageJson.name}@`)) {
          return { packageManager: 'yarn', installMethod: 'global' };
        }
      } catch {
        // Expected - yarn might not be available or package not globally installed
      }

      // Method 4: Check where dmux is installed by looking at the executable path
      try {
        const dmuxPath = execSync('which dmux', {
          encoding: 'utf-8',
          stdio: 'pipe'
        }).trim();
        
        if (dmuxPath.includes('/.npm/') || dmuxPath.includes('/npm/')) {
          return { packageManager: 'npm', installMethod: 'global' };
        } else if (dmuxPath.includes('/.pnpm/')) {
          return { packageManager: 'pnpm', installMethod: 'global' };
        } else if (dmuxPath.includes('/.yarn/')) {
          return { packageManager: 'yarn', installMethod: 'global' };
        } else if (dmuxPath.includes('/node_modules/.bin/')) {
          // Local installation
          return { packageManager: null, installMethod: 'local' };
        }
      } catch {
        // Expected - which command might not be available or dmux not in PATH
      }

      return { packageManager: null, installMethod: 'unknown' };
    } catch (error) {
      this.logger.warn('Failed to detect installation method', 'AutoUpdater');
      return { packageManager: null, installMethod: 'unknown' };
    }
  }

  async checkForUpdates(): Promise<UpdateInfo> {
    const latestVersion = await this.getLatestVersion();
    const currentVersion = packageJson.version;
    const { packageManager, installMethod } = await this.detectInstallMethod();
    
    const hasUpdate = latestVersion ? this.compareVersions(currentVersion, latestVersion) : false;
    
    // Update last check time
    const settings = await this.loadSettings();
    settings.lastCheckTime = Date.now();
    await this.saveSettings(settings);
    
    return {
      currentVersion,
      latestVersion: latestVersion || 'unknown',
      hasUpdate,
      packageManager,
      installMethod
    };
  }

  async performUpdate(updateInfo: UpdateInfo): Promise<boolean> {
    if (!updateInfo.hasUpdate || !updateInfo.packageManager || updateInfo.installMethod !== 'global') {
      return false;
    }

    try {
      let updateCommand: string;
      
      switch (updateInfo.packageManager) {
        case 'npm':
          updateCommand = `npm update -g ${packageJson.name}`;
          break;
        case 'pnpm':
          updateCommand = `pnpm update -g ${packageJson.name}`;
          break;
        case 'yarn':
          updateCommand = `yarn global upgrade ${packageJson.name}`;
          break;
        default:
          return false;
      }

      // Run the update command with a timeout
      execSync(updateCommand, {
        stdio: 'pipe',
        timeout: 60000 // 1 minute timeout
      });

      // Verify the update was successful
      const newUpdateInfo = await this.checkForUpdates();
      return newUpdateInfo.currentVersion === updateInfo.latestVersion;
    } catch (error) {
      this.logger.error('Update failed', 'AutoUpdater', undefined, error as Error);
      return false;
    }
  }

  async skipVersion(version: string): Promise<void> {
    const settings = await this.loadSettings();
    settings.skipVersion = version;
    await this.saveSettings(settings);
  }

  async shouldShowUpdateNotification(updateInfo: UpdateInfo): Promise<boolean> {
    if (!updateInfo.hasUpdate) {
      return false;
    }

    const settings = await this.loadSettings();
    
    // Don't show if user has disabled auto-updates
    if (settings.autoUpdateEnabled === false) {
      return false;
    }
    
    // Don't show if user has skipped this version
    if (settings.skipVersion === updateInfo.latestVersion) {
      return false;
    }

    return true;
  }

  async setAutoUpdateEnabled(enabled: boolean): Promise<void> {
    const settings = await this.loadSettings();
    settings.autoUpdateEnabled = enabled;
    await this.saveSettings(settings);
  }
}