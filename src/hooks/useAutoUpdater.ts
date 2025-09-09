import { useEffect, useState } from 'react';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  packageManager: 'npm' | 'pnpm' | 'yarn' | null;
  installMethod: 'global' | 'local' | 'unknown';
}

export default function useAutoUpdater(autoUpdater: any | undefined, setStatusMessage: (msg: string) => void) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Only run the worker check, not the old blocking check
    let worker: Worker | null = null;
    let updateInterval: NodeJS.Timeout | null = null;

    const runWorkerCheck = () => {
      try {
        // Create a new worker thread for update checking
        const workerPath = path.join(__dirname, '../workers/updateChecker.js');
        
        // Check if worker file exists first
        if (!require('fs').existsSync(workerPath)) {
          return;
        }
        
        worker = new Worker(workerPath);
        
        worker.on('message', (message) => {
          if (message.type === 'update-available') {
            setUpdateInfo(message.updateInfo);
            setUpdateAvailable(true);
          }
          // Clean up the worker after it's done
          worker?.terminate();
          worker = null;
        });

        worker.on('error', () => {
          // Silently ignore errors
          worker?.terminate();
          worker = null;
        });
      } catch {
        // Silently ignore any errors creating the worker
      }
    };

    // Initial check after a short delay
    const initialCheckTimer = setTimeout(() => {
      runWorkerCheck();
    }, 3000);

    // Periodic checks every 6 hours
    updateInterval = setInterval(() => {
      runWorkerCheck();
    }, 6 * 60 * 60 * 1000);

    return () => {
      clearTimeout(initialCheckTimer);
      if (updateInterval) clearInterval(updateInterval);
      if (worker) {
        worker.terminate();
      }
    };
  }, []);

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
    } catch (error) {
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
