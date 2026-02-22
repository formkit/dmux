import { parentPort, workerData } from 'worker_threads';
import { AutoUpdater } from '../services/AutoUpdater.js';

interface UpdateCheckerWorkerData {
  configFile: string;
}

async function checkForUpdates() {
  try {
    const { configFile } = workerData as UpdateCheckerWorkerData;
    if (!configFile) {
      throw new Error('Missing config file path for update checker worker');
    }

    const autoUpdater = new AutoUpdater(configFile);
    const shouldCheck = await autoUpdater.shouldCheckForUpdates();
    let updateInfo = shouldCheck
      ? await autoUpdater.checkForUpdates()
      : await autoUpdater.getCachedUpdateInfo();

    // Keep showing a known update if today's check couldn't reach npm.
    if (shouldCheck && updateInfo && updateInfo.latestVersion === 'unknown') {
      const cachedUpdateInfo = await autoUpdater.getCachedUpdateInfo();
      if (cachedUpdateInfo) {
        updateInfo = cachedUpdateInfo;
      }
    }

    // No cache yet: run an initial check even if interval says "not yet".
    if (!updateInfo) {
      updateInfo = await autoUpdater.checkForUpdates();
    }

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
