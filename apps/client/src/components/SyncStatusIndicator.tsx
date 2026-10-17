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
      {/* Network Connectivity Pill */}
      <button
        type="button"
        onClick={onOpenSyncScreen}
        data-testid="network-status-pill"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
          isOnline
            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:bg-emerald-950/60'
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
      </button>

      {/* Sync State / Pending / Error Badge */}
      {hasError ? (
        <button
          type="button"
          onClick={handleBadgeClick}
          data-testid="sync-error-badge"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-red-950/60 border-red-700/70 text-red-300 hover:bg-red-900/60 transition-all cursor-pointer"
          title={status.lastError || `${rejectedCount} rejected changes need review`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span>{rejectedCount > 0 ? `${rejectedCount} conflict` : 'Sync error'}</span>
        </button>
      ) : pendingCount > 0 || isSyncing ? (
        <button
          type="button"
          onClick={handleBadgeClick}
          disabled={!isOnline && !onOpenSyncScreen}
          data-testid="sync-pending-badge"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
            isOnline
              ? 'bg-blue-950/60 border-blue-700/60 text-blue-300 hover:bg-blue-900/60 cursor-pointer'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 cursor-pointer opacity-90'
          }`}
          title={
            isOnline
              ? 'Click to sync pending changes now'
              : 'Changes saved locally; will sync automatically when online'
          }
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : `${pendingCount} pending`}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenSyncScreen}
          data-testid="sync-uptodate-badge"
          className="hidden sm:flex items-center gap-1 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Up to date</span>
        </button>
      )}
    </div>
  );
}
