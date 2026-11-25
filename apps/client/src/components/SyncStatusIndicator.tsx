import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SyncStatusSnapshot } from '../services/syncEngine.js';

interface SyncStatusIndicatorProps {
  isOnline: boolean;
  status: SyncStatusSnapshot;
  pendingCount: number;
  rejectedCount?: number;
  onManualSync?: () => Promise<void>;
  onOpenSyncScreen?: () => void;
}

export function SyncStatusIndicator({
  isOnline,
  status,
  pendingCount,
  rejectedCount = 0,
  onManualSync,
  onOpenSyncScreen,
}: SyncStatusIndicatorProps) {
  const isSyncing = status.state === 'syncing';
  const hasError = status.state === 'error' || rejectedCount > 0;

  const handleBadgeClick = async () => {
    if (onOpenSyncScreen && hasError) {
      onOpenSyncScreen();
      return;
    }
    if (isOnline && !isSyncing && onManualSync) {
      await onManualSync();
    } else if (onOpenSyncScreen) {
      onOpenSyncScreen();
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs font-medium">
      <button
        type="button"
        onClick={onOpenSyncScreen}
        data-testid="network-status-pill"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors cursor-pointer ${
          isOnline
            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950'
            : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950'
        }`}
      >
        {isOnline ? (
          <>
            <Wifi className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" strokeWidth={1.75} />
            <span>Online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
            <span>Offline</span>
          </>
        )}
      </button>

      {hasError ? (
        <button
          type="button"
          onClick={handleBadgeClick}
          data-testid="sync-error-badge"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950 transition-colors cursor-pointer"
          title={status.lastError || `${rejectedCount} rejected changes need review`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" strokeWidth={1.75} />
          <span className="tabular-nums">{rejectedCount > 0 ? `${rejectedCount} conflict` : 'Sync error'}</span>
        </button>
      ) : pendingCount > 0 || isSyncing ? (
        <button
          type="button"
          onClick={handleBadgeClick}
          disabled={!isOnline && !onOpenSyncScreen}
          data-testid="sync-pending-badge"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors ${
            isOnline
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950 cursor-pointer'
              : 'bg-zinc-100 dark:bg-carbon-elevated border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer'
          }`}
          title={
            isOnline
              ? 'Click to sync pending changes now'
              : 'Changes saved locally; will sync automatically when online'
          }
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-700 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-400'}`}
            strokeWidth={1.75}
          />
          <span className="tabular-nums">{isSyncing ? 'Syncing...' : `${pendingCount} pending`}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenSyncScreen}
          data-testid="sync-uptodate-badge"
          className="hidden sm:flex items-center gap-1 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white px-2 py-1 rounded transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" strokeWidth={1.75} />
          <span>Up to date</span>
        </button>
      )}
    </div>
  );
}
