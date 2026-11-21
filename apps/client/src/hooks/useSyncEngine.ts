import { useEffect, useState, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb } from '../db/index.js';
import { defaultSyncEngine, SyncStatusSnapshot } from '../services/syncEngine.js';
import { useOnlineStatus } from './useOnlineStatus.js';

export function useSyncEngine(storeId: string | null) {
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState<SyncStatusSnapshot>(() => defaultSyncEngine.getStatus());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingOutboxCount = useLiveQuery(
    () =>
      localDb.outbox
        .filter((m) => m.status === undefined || m.status === 'pending')
        .count(),
    [],
    0
  );

  const rejectedOutboxCount = useLiveQuery(
    () => localDb.outbox.filter((m) => m.status === 'rejected').count(),
    [],
    0
  );

  // Subscribe to SyncEngine status updates
  useEffect(() => {
    return defaultSyncEngine.subscribe((next) => {
      setStatus(next);
    });
  }, []);

  const triggerSync = useCallback(async () => {
    if (!storeId || !navigator.onLine) {
      return;
    }

    // Attempt Background Sync registration non-blockingly only if an active SW is already registered
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg?.active && 'sync' in reg) {
            return (reg as any).sync.register('countwise-outbox-sync');
          }
        })
        .catch(() => {
          // Fallback to foreground sync
        });
    }

    try {
      await defaultSyncEngine.syncStore(storeId);
    } catch {
      // Schedule exponential backoff retry with jitter if not an auth error
      const latest = defaultSyncEngine.getStatus();
      if (!latest.authRequired && navigator.onLine) {
        const delayMs = defaultSyncEngine.getNextRetryDelayMs();
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          triggerSync();
        }, delayMs);
      }
    }
  }, [storeId]);

  // Trigger 1: App start & store switch, and Trigger 2: `online` event
  useEffect(() => {
    if (isOnline && storeId) {
      triggerSync();
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [isOnline, storeId, triggerSync]);

  // Trigger 3: Debounced sync after local outbox changes
  useEffect(() => {
    if (!isOnline || !storeId || pendingOutboxCount === 0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      triggerSync();
    }, 650);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [pendingOutboxCount, isOnline, storeId, triggerSync]);

  return {
    status,
    isOnline,
    pendingOutboxCount,
    rejectedOutboxCount,
    triggerSync,
  };
}

