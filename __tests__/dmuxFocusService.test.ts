import { describe, expect, it } from 'vitest';
import { parseHelperSocketOwnerProcessIds } from '../src/services/DmuxFocusService.js';

describe('DmuxFocusService helper restart', () => {
  it('only returns processes that own the helper socket path', () => {
    const socketPath = '/Users/test/.dmux/native-helper/run/dmux-helper.sock';
    const lsofOutput = [
      'COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
      `dmux-help 35876 test    3u  unix 0x123      0t0      ${socketPath}`,
      `dmux-help 35876 test    4u  unix 0x456      0t0      ${socketPath}`,
      'node      39503 test   19u  unix 0x789      0t0      ->0x456',
      'node      39504 test   20u  unix 0xabc      0t0      ->0x123',
    ].join('\n');

    expect(parseHelperSocketOwnerProcessIds(lsofOutput, socketPath, 99999)).toEqual([35876]);
  });

  it('filters out the current process id', () => {
    const socketPath = '/Users/test/.dmux/native-helper/run/dmux-helper.sock';
    const lsofOutput = [
      'COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
      `dmux-help 12345 test    3u  unix 0x123      0t0      ${socketPath}`,
    ].join('\n');

    expect(parseHelperSocketOwnerProcessIds(lsofOutput, socketPath, 12345)).toEqual([]);
  });
});
