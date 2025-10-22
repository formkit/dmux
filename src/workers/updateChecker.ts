import { parentPort } from 'worker_threads';
import { AutoUpdater } from '../services/AutoUpdater.js';
import os from 'os';
import path from 'path';

async function checkForUpdates() {
  try {
    const dmuxDir = path.join(os.homedir(), '.dmux');
    const autoUpdater = new AutoUpdater(dmuxDir);
    
    const updateInfo = await autoUpdater.checkForUpdates();
    const shouldShow = await autoUpdater.shouldShowUpdateNotification(updateInfo);
    
    if (shouldShow && updateInfo.hasUpdate) {
      parentPort?.postMessage({
        type: 'update-available',
        updateInfo
      });
    } else {
      parentPort?.postMessage({
        type: 'no-update',
        updateInfo
      });
    }
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Start the check
checkForUpdates();