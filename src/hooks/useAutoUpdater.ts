import { useEffect, useState } from 'react';
import { Worker } from 'worker_threads';
import { existsSync } from 'fs';
import { resolveDistPath } from '../utils/runtimePaths.js';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  packageManager: 'npm' | 'pnpm' | 'yarn' | null;
  installMethod: 'global' | 'local' | 'unknown';
}

interface UpdateCheckerMessage {
  type: 'update-available' | 'no-update' | 'error';
  updateInfo?: UpdateInfo;
}

const INITIAL_CHECK_DELAY_MS = 3000;
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

export default function useAutoUpdater(autoUpdater: any | undefined, setStatusMessage: (msg: string) => void) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let worker: Worker | null = null;
    let updateInterval: NodeJS.Timeout | null = null;
    const workerPath = resolveDistPath('workers', 'updateChecker.js');
    const configFile =
      autoUpdater && typeof autoUpdater.configFile === 'string'
        ? autoUpdater.configFile
        : undefined;

    const releaseWorker = () => {
      if (!worker) {
        return;
      }
      worker.removeAllListeners();
      worker = null;
    };

    const runWorkerCheck = () => {
      if (worker) {
        return;
      }

      try {
        if (!existsSync(workerPath) || !configFile) {
          return;
        }

        worker = new Worker(workerPath, {
          workerData: {
            configFile
          }
        });

        worker.once('message', (message: UpdateCheckerMessage) => {
          if (message.type === 'update-available') {
            setUpdateInfo(message.updateInfo || null);
            setUpdateAvailable(true);
          } else if (message.type === 'no-update') {
            setUpdateInfo(null);
            setUpdateAvailable(false);
          }
          releaseWorker();
        });

        worker.once('error', () => {
          releaseWorker();
        });

        worker.once('exit', () => {
          releaseWorker();
        });
      } catch {
        releaseWorker();
      }
    };

    const initialCheckTimer = setTimeout(() => {
      runWorkerCheck();
    }, INITIAL_CHECK_DELAY_MS);

    updateInterval = setInterval(() => {
      runWorkerCheck();
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialCheckTimer);
      if (updateInterval) clearInterval(updateInterval);
      if (worker) {
        worker.terminate().catch(() => {});
        releaseWorker();
      }
    };
  }, [autoUpdater]);

  const performUpdate = async () => {
    if (!autoUpdater || !updateInfo) return;

    try {
      setIsUpdating(true);
      setStatusMessage('Updating dmux...');

      const success = await autoUpdater.performUpdate(updateInfo);

      if (success) {
        setStatusMessage('Update completed successfully! Please restart dmux.');
        setTimeout(() => {
          process.exit(0);
        }, 3000);
      } else {
        setStatusMessage('Update failed. Please update manually.');
        setTimeout(() => setStatusMessage(''), 3000);
      }
    } catch {
      setStatusMessage('Update failed. Please update manually.');
      setTimeout(() => setStatusMessage(''), 3000);
    } finally {
      setIsUpdating(false);
      setShowUpdateDialog(false);
    }
  };

  const skipUpdate = async () => {
    if (!autoUpdater || !updateInfo) return;
    await autoUpdater.skipVersion(updateInfo.latestVersion);
    setShowUpdateDialog(false);
    setUpdateInfo(null);
  };

  const dismissUpdate = () => {
    setShowUpdateDialog(false);
    setUpdateInfo(null);
  };

  return { updateInfo, showUpdateDialog, isUpdating, performUpdate, skipUpdate, dismissUpdate, setShowUpdateDialog, setUpdateInfo, updateAvailable };
}
