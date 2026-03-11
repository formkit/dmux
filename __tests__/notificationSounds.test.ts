import { describe, expect, it } from 'vitest';
import {
  getDefaultNotificationSoundSelection,
  pickNotificationSound,
  resolveNotificationSoundsSelection,
} from '../src/utils/notificationSounds.js';

describe('notification sounds', () => {
  it('defaults to the system sound only', () => {
    expect(getDefaultNotificationSoundSelection()).toEqual(['default-system-sound']);
    expect(resolveNotificationSoundsSelection(undefined)).toEqual(['default-system-sound']);
  });

  it('falls back to the system sound when the configured selection is empty', () => {
    expect(resolveNotificationSoundsSelection([])).toEqual(['default-system-sound']);
  });

  it('filters invalid sound ids and preserves definition order', () => {
    expect(
      resolveNotificationSoundsSelection(['war-horn', 'invalid-sound', 'harp'])
    ).toEqual(['harp', 'war-horn']);
  });

  it('picks a bundled sound deterministically for a given random value', () => {
    expect(
      pickNotificationSound(['default-system-sound', 'harp', 'war-horn'], 0.6)
    ).toMatchObject({
      id: 'harp',
      resourceFileName: 'dmux-harp.caf',
    });
  });

  it('returns the default system sound when that slot is chosen', () => {
    const selection = pickNotificationSound(['default-system-sound', 'harp', 'war-horn'], 0.01);
    expect(selection.id).toBe('default-system-sound');
    expect(selection.resourceFileName).toBeUndefined();
  });
});
