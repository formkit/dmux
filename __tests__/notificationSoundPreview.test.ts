import { describe, expect, it } from 'vitest';
import { resolvePackagePath } from '../src/utils/runtimePaths.js';
import { buildNotificationSoundPreviewCommand } from '../src/utils/notificationSoundPreview.js';

describe('notification sound preview commands', () => {
  it('uses AppleScript beep for the system sound preview', () => {
    expect(
      buildNotificationSoundPreviewCommand('default-system-sound', 'darwin')
    ).toEqual({
      command: 'osascript',
      args: ['-e', 'beep'],
    });
  });

  it('uses afplay for bundled sound previews', () => {
    expect(buildNotificationSoundPreviewCommand('harp', 'darwin')).toEqual({
      command: 'afplay',
      args: [resolvePackagePath('native', 'macos', 'sounds', 'dmux-harp.caf')],
    });
  });

  it('disables preview commands outside macOS', () => {
    expect(buildNotificationSoundPreviewCommand('harp', 'linux')).toBeNull();
  });
});
