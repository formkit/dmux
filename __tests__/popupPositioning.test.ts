import { describe, expect, it } from 'vitest';
import { getPaneAnchoredPopupOptions } from '../src/utils/popup.js';

describe('getPaneAnchoredPopupOptions', () => {
  it('centers the popup over the target pane and clamps it to the client bounds', () => {
    const popupOptions = getPaneAnchoredPopupOptions(
      {
        paneId: '%1',
        left: 70,
        top: 12,
        width: 30,
        height: 10,
      },
      {
        width: 60,
        height: 20,
      },
      {
        width: 100,
        height: 40,
      }
    );

    expect(popupOptions).toMatchObject({
      centered: false,
      width: 60,
      height: 20,
      x: 40,
      y: 12,
    });
  });
});
