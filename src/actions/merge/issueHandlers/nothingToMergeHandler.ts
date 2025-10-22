/**
 * Nothing To Merge Handler
 * Handles the case when there are no new commits to merge
 */

import type { ActionResult } from '../../types.js';

export function handleNothingToMerge(): ActionResult {
  return {
    type: 'info',
    message: 'No new commits to merge',
    dismissable: true,
  };
}
