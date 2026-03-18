import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { NotificationSoundsPopupApp } from '../src/components/popups/notificationSoundsPopup.js';
import type { NotificationSoundPreviewPlayer } from '../src/utils/notificationSoundPreview.js';

const ESC = String.fromCharCode(27);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function down(stdin: { write: (value: string) => void }) {
  stdin.write(`${ESC}[B`);
  await sleep(5);
}

async function space(stdin: { write: (value: string) => void }) {
  stdin.write(' ');
  await sleep(5);
}

describe('NotificationSoundsPopupApp', () => {
  it('plays a preview when enabling a sound from the list', async () => {
    const previewPlayer: NotificationSoundPreviewPlayer = {
      play: vi.fn(),
      stop: vi.fn(),
    };

    const { stdin } = render(
      <NotificationSoundsPopupApp
        resultFile="/tmp/dmux-notification-sounds-result.json"
        data={{
          sounds: [
            {
              id: 'default-system-sound',
              label: 'Default System Sound',
              defaultEnabled: true,
            },
            {
              id: 'harp',
              label: 'Harp',
              defaultEnabled: false,
            },
          ],
          enabledNotificationSounds: ['default-system-sound'],
        }}
        previewPlayer={previewPlayer}
      />
    );

    await sleep(20);
    await down(stdin);
    await space(stdin);

    expect(previewPlayer.play).toHaveBeenCalledWith('harp');
  });

  it('does not replay a preview when disabling an already-enabled sound', async () => {
    const previewPlayer: NotificationSoundPreviewPlayer = {
      play: vi.fn(),
      stop: vi.fn(),
    };

    const { stdin } = render(
      <NotificationSoundsPopupApp
        resultFile="/tmp/dmux-notification-sounds-result.json"
        data={{
          sounds: [
            {
              id: 'harp',
              label: 'Harp',
              defaultEnabled: false,
            },
          ],
          enabledNotificationSounds: ['harp'],
        }}
        previewPlayer={previewPlayer}
      />
    );

    await sleep(20);
    await space(stdin);

    expect(previewPlayer.play).not.toHaveBeenCalled();
  });
});
