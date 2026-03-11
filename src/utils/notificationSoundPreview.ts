import { spawn, type ChildProcess } from 'child_process';
import type { NotificationSoundId } from './notificationSounds.js';
import { getNotificationSoundDefinition } from './notificationSounds.js';
import { resolvePackagePath } from './runtimePaths.js';

export interface NotificationSoundPreviewCommand {
  command: string;
  args: string[];
}

export interface NotificationSoundPreviewPlayer {
  play(soundId: NotificationSoundId): void;
  stop(): void;
}

export function buildNotificationSoundPreviewCommand(
  soundId: NotificationSoundId,
  platform: NodeJS.Platform = process.platform
): NotificationSoundPreviewCommand | null {
  if (platform !== 'darwin') {
    return null;
  }

  const definition = getNotificationSoundDefinition(soundId);
  if (!definition.resourceFileName) {
    return {
      command: 'osascript',
      args: ['-e', 'beep'],
    };
  }

  return {
    command: 'afplay',
    args: [resolvePackagePath('native', 'macos', 'sounds', definition.resourceFileName)],
  };
}

export function createNotificationSoundPreviewPlayer(
  platform: NodeJS.Platform = process.platform
): NotificationSoundPreviewPlayer {
  let activeProcess: ChildProcess | null = null;

  const clearActiveProcess = (processToClear: ChildProcess) => {
    if (activeProcess === processToClear) {
      activeProcess = null;
    }
  };

  return {
    play(soundId: NotificationSoundId) {
      this.stop();

      const previewCommand = buildNotificationSoundPreviewCommand(soundId, platform);
      if (!previewCommand) {
        return;
      }

      const child = spawn(previewCommand.command, previewCommand.args, {
        stdio: 'ignore',
      });

      activeProcess = child;
      child.once('error', () => {
        clearActiveProcess(child);
      });
      child.once('exit', () => {
        clearActiveProcess(child);
      });
    },

    stop() {
      if (!activeProcess) {
        return;
      }

      activeProcess.kill();
      activeProcess = null;
    },
  };
}
