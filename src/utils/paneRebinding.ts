import type { DmuxPane } from '../types.js';
import { LogService } from '../services/LogService.js';

/**
 * Attempts to rebind a pane whose ID has changed by matching on title (slug).
 *
 * IMPORTANT: Only rebinds if the pane ID is truly missing (pane was killed and recreated).
 * Does NOT rebind if the title simply changed (user renamed it).
 *
 * @param pane - The pane to potentially rebind
 * @param titleToIdMap - Map of pane titles to their current tmux pane IDs
 * @param allPaneIds - Array of all current tmux pane IDs
 * @returns The pane with potentially updated paneId
 */
export function rebindPaneByTitle(
  pane: DmuxPane,
  titleToIdMap: Map<string, string>,
  allPaneIds: string[]
): DmuxPane {
  // If pane ID exists in tmux, keep using it (even if title changed)
  if (allPaneIds.length > 0 && allPaneIds.includes(pane.paneId)) {
    return pane; // Pane still exists, no rebinding needed
  }

  // Pane ID missing - try to find it by title match
  if (allPaneIds.length > 0 && !allPaneIds.includes(pane.paneId)) {
    const remappedId = titleToIdMap.get(pane.slug);
    if (remappedId) {
      LogService.getInstance().debug(
        `Rebound pane ${pane.id} from ${pane.paneId} to ${remappedId} (matched by title: ${pane.slug})`,
        'shellDetection'
      );
      return { ...pane, paneId: remappedId };
    }
  }

  return pane;
}
