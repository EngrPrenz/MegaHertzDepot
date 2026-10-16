import { useLiveQuery } from 'dexie-react-hooks';
import { localDb } from '../db/index.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface SyncStatusIndicatorProps {
  onManualSync?: () => Promise<void>;
}

export function SyncStatusIndicator({ onManualSync }: SyncStatusIndicatorProps) {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);

  // Reactive Dexie query: updates immediately whenever an outbox write occurs
  const pendingCount = useLiveQuery(() => localDb.outbox.count(), [], 0);

  const handleSyncClick = async () => {
    if (!isOnline || isSyncing || !onManualSync) return;
    try {
      setIsSyncing(true);
      await onManualSync();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs font-medium">
      {/* Network Connectivity Pill */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${
          isOnline
            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
            : 'bg-amber-950/50 border-amber-800/70 text-amber-300 animate-pulse'
        }`}
      >
        {isOnline ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <Wifi className="w-3.5 h-3.5" />
            <span>Online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Offline</span>
          </>
        )}
      </div>

      {/* Outbox Pending Changes Badge */}
      {pendingCount > 0 ? (
        <button
          onClick={handleSyncClick}
          disabled={!isOnline || isSyncing}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
            isOnline
              ? 'bg-blue-950/60 border-blue-700/60 text-blue-300 hover:bg-blue-900/60 cursor-pointer'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 cursor-not-allowed opacity-80'
          }`}
          title={isOnline ? 'Click to sync pending changes' : 'Will sync automatically when back online'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
          <span>{pendingCount} pending</span>
        </button>
      ) : (
        <div className="hidden sm:flex items-center gap-1 text-slate-400 px-2 py-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Up to date</span>
        </div>
      )}
    </div>
  );
}
