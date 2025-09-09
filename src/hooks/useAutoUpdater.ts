import { useEffect, useState } from 'react';

export default function useAutoUpdater(autoUpdater: any | undefined, setStatusMessage: (msg: string) => void) {
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!autoUpdater) return;

    const checkForUpdates = async () => {
      try {
        const info = await autoUpdater.checkForUpdates();
        if (await autoUpdater.shouldShowUpdateNotification(info)) {
          setUpdateInfo(info);
          setShowUpdateDialog(true);
        }
      } catch {
        // ignore
      }
    };

    const initialCheckTimer = setTimeout(() => {
      checkForUpdates();
    }, 3000);

    const updateInterval = setInterval(checkForUpdates, 6 * 60 * 60 * 1000);

    return () => {
      clearTimeout(initialCheckTimer);
      clearInterval(updateInterval);
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

  return { updateInfo, showUpdateDialog, isUpdating, performUpdate, skipUpdate, dismissUpdate, setShowUpdateDialog, setUpdateInfo };
}
