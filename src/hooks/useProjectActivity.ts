import { resolve as resolvePath } from 'path';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BeginProjectActivity,
  ProjectActivityRoot,
  TrackProjectActivity,
} from '../types/activity.js';

const BUSY_VISIBILITY_DELAY_MS = 120;

interface ActivityEntry {
  projectRoot: string | null;
  visible: boolean;
  timer: NodeJS.Timeout | null;
}

function normalizeProjectRoot(
  projectRoot: ProjectActivityRoot,
  defaultProjectRoot: string
): string | null {
  if (projectRoot === null) return null;
  return resolvePath(projectRoot || defaultProjectRoot);
}

export function useProjectActivity(defaultProjectRoot: string) {
  const activitiesRef = useRef(new Map<number, ActivityEntry>());
  const nextIdRef = useRef(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return () => {
      for (const entry of activitiesRef.current.values()) {
        if (entry.timer) {
          clearTimeout(entry.timer);
        }
      }
      activitiesRef.current.clear();
    };
  }, []);

  const beginProjectActivity = useCallback<BeginProjectActivity>((projectRoot) => {
    const activityId = nextIdRef.current++;
    const entry: ActivityEntry = {
      projectRoot: normalizeProjectRoot(projectRoot, defaultProjectRoot),
      visible: false,
      timer: null,
    };

    entry.timer = setTimeout(() => {
      const currentEntry = activitiesRef.current.get(activityId);
      if (!currentEntry) return;
      currentEntry.visible = true;
      currentEntry.timer = null;
      setVersion((prev) => prev + 1);
    }, BUSY_VISIBILITY_DELAY_MS);

    activitiesRef.current.set(activityId, entry);

    return () => {
      const currentEntry = activitiesRef.current.get(activityId);
      if (!currentEntry) return;

      if (currentEntry.timer) {
        clearTimeout(currentEntry.timer);
      }

      const wasVisible = currentEntry.visible;
      activitiesRef.current.delete(activityId);

      if (wasVisible) {
        setVersion((prev) => prev + 1);
      }
    };
  }, [defaultProjectRoot]);

  const trackProjectActivity = useCallback<TrackProjectActivity>(async (work, projectRoot) => {
    const finish = beginProjectActivity(projectRoot);
    try {
      return await work();
    } finally {
      finish();
    }
  }, [beginProjectActivity]);

  const visibleActivities = useMemo(() => {
    return Array.from(activitiesRef.current.values()).filter((entry) => entry.visible);
  }, [version]);

  const isProjectBusy = useCallback((projectRoot?: string | null) => {
    const normalized = normalizeProjectRoot(projectRoot, defaultProjectRoot);

    return visibleActivities.some((entry) => {
      if (entry.projectRoot === null) return true;
      return entry.projectRoot === normalized;
    });
  }, [defaultProjectRoot, visibleActivities]);

  return {
    beginProjectActivity,
    trackProjectActivity,
    isProjectBusy,
  };
}
