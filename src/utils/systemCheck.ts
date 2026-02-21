import { execSync } from 'child_process';
import chalk from 'chalk';
import { getAvailableAgents } from './agentDetection.js';
import { LogService } from '../services/LogService.js';

/**
 * System requirement check results
 */
export interface ValidationResult {
  canRun: boolean;
  warnings: string[];
  errors: string[];
}

interface DependencyCheck {
  valid: boolean;
  version?: string;
  errors: string[];
}

/**
 * Check if tmux is installed and meets minimum version requirement
 */
function checkTmuxVersion(minVersion: string): DependencyCheck {
  try {
    const version = execSync('tmux -V', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    // tmux -V outputs: "tmux 3.3a" or similar
    const versionMatch = version.match(/tmux\s+([\d.]+)/);

    if (!versionMatch) {
      return {
        valid: false,
        errors: [`Could not parse tmux version: ${version}`]
      };
    }

    const installedVersion = versionMatch[1];
    const installed = parseVersion(installedVersion);
    const required = parseVersion(minVersion);

    if (compareVersions(installed, required) >= 0) {
      return {
        valid: true,
        version: installedVersion,
        errors: []
      };
    } else {
      return {
        valid: false,
        version: installedVersion,
        errors: [`tmux version ${installedVersion} is below minimum required version ${minVersion}`]
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: ['tmux is not installed or not in PATH']
    };
  }
}

/**
 * Check if git is installed and meets minimum version requirement
 */
function checkGitVersion(minVersion: string): DependencyCheck {
  try {
    const version = execSync('git --version', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    // git --version outputs: "git version 2.39.0" or similar
    const versionMatch = version.match(/git version\s+([\d.]+)/);

    if (!versionMatch) {
      return {
        valid: false,
        errors: [`Could not parse git version: ${version}`]
      };
    }

    const installedVersion = versionMatch[1];
    const installed = parseVersion(installedVersion);
    const required = parseVersion(minVersion);

    if (compareVersions(installed, required) >= 0) {
      return {
        valid: true,
        version: installedVersion,
        errors: []
      };
    } else {
      return {
        valid: false,
        version: installedVersion,
        errors: [`git version ${installedVersion} is below minimum required version ${minVersion}`]
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: ['git is not installed or not in PATH']
    };
  }
}


/**
 * Parse version string into comparable array [major, minor, patch]
 */
function parseVersion(version: string): number[] {
  return version.split('.').map(v => {
    const num = parseInt(v.replace(/[^\d]/g, ''), 10);
    return isNaN(num) ? 0 : num;
  });
}

/**
 * Compare two version arrays
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: number[], b: number[]): number {
  const maxLength = Math.max(a.length, b.length);

  for (let i = 0; i < maxLength; i++) {
    const aVal = a[i] || 0;
    const bVal = b[i] || 0;

    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }

  return 0;
}

/**
 * Validate all system requirements for dmux
 * Returns validation result with errors and warnings
 */
export async function validateSystemRequirements(): Promise<ValidationResult> {
  const checks = {
    tmux: checkTmuxVersion('3.0'),
    git: checkGitVersion('2.20'),
    agents: await getAvailableAgents()
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  // Collect errors
  errors.push(...checks.tmux.errors);
  errors.push(...checks.git.errors);

  // Warnings for missing agents
  if (checks.agents.length === 0) {
    warnings.push('No agents found (claude, opencode, or codex). You will not be able to use AI features.');
  } else {
    const allAgents: Array<'claude' | 'opencode' | 'codex'> = ['claude', 'opencode', 'codex'];
    const missing = allAgents.filter(a => !checks.agents.includes(a));
    if (missing.length > 0) {
      warnings.push(`Agent(s) not found: ${missing.map(a => `'${a}'`).join(', ')}. Available: ${checks.agents.map(a => `'${a}'`).join(', ')}.`);
    }
  }

  // Check for gh CLI (optional)
  try {
    execSync('gh --version', { encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    warnings.push('GitHub CLI (gh) not found. PR workflow features will be unavailable. Install from https://cli.github.com/');
  }

  return {
    canRun: checks.tmux.valid && checks.git.valid,
    warnings,
    errors
  };
}

/**
 * Print validation results to console with colors
 * Exits process if critical errors found
 */
export function printValidationResults(result: ValidationResult): void {
  const logger = LogService.getInstance();

  if (result.errors.length > 0) {
    console.error(chalk.red.bold('\n❌ System Requirements Check Failed:\n'));
    result.errors.forEach(error => {
      console.error(chalk.red(`  • ${error}`));
      logger.error(error, 'systemCheck');
    });
    console.error(chalk.yellow('\nPlease install missing dependencies and try again.\n'));
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    // Log warnings using logger instead of console.warn
    result.warnings.forEach(warning => {
      logger.warn(warning, 'systemCheck');
    });
  }
}
