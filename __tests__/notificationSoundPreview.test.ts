import { describe, expect, it } from 'vitest';
import {
  buildNotificationSoundPreviewMessage,
  getDmuxHelperSocketPath,
} from '../src/utils/notificationSoundPreview.js';

describe('notification sound preview commands', () => {
  it('routes the system sound preview through the helper without a bundled resource', () => {
    expect(
      buildNotificationSoundPreviewMessage('default-system-sound', 'darwin')
    ).toEqual({
      type: 'preview-sound',
      soundName: undefined,
    });
  });

  it('routes bundled sound previews through the helper resource name', () => {
    expect(buildNotificationSoundPreviewMessage('harp', 'darwin')).toEqual({
      type: 'preview-sound',
      soundName: 'dmux-harp.caf',
    });
  });

  it('disables preview messages outside macOS', () => {
    expect(buildNotificationSoundPreviewMessage('harp', 'linux')).toBeNull();
  });

  it('uses the default helper socket path', () => {
    expect(getDmuxHelperSocketPath('/tmp/home')).toBe(
      '/tmp/home/.dmux/native-helper/run/dmux-helper.sock'
    );
  });
});
