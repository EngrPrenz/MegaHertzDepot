import { useLiveQuery } from 'dexie-react-hooks';
import { localDb } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import { SyncStatusSnapshot } from '../services/syncEngine.js';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Trash2,
  RotateCcw,
  ChevronRight,
  LogOut,
} from 'lucide-react';

interface SyncStatusPageProps {
  storeId: string;
  isOnline: boolean;
  isDemoMode?: boolean;
  status: SyncStatusSnapshot;
  onManualSync: () => Promise<void>;
  onExitDemoMode?: () => void;
}

function formatMutationLabel(type: string, payload: any, mutationId: string): string {
  if (payload?.name) return payload.name;
  if (payload?.delta !== undefined) {
    return `Stock adjustment (${payload.delta > 0 ? `+${payload.delta}` : payload.delta})`;
  }
  if (payload?.receiptNumber) return `Receipt ${payload.receiptNumber}`;
  return `${type} (${mutationId.slice(0, 8)})`;
}

export function SyncStatusPage({
  storeId,
  isOnline,
  isDemoMode = false,
  status,
  onManualSync,
  onExitDemoMode,
}: SyncStatusPageProps) {
  const outboxItems = useLiveQuery(
    () => localDb.outbox.orderBy('createdAt').toArray(),
    [],
    []
  );

  const lastSyncMeta = useLiveQuery(() => localDb.meta.get('lastSyncAt'), []);
  const seqMeta = useLiveQuery(() => localDb.meta.get(`lastPulledSeq:${storeId}`), [storeId]);
  const hlcMeta = useLiveQuery(() => localDb.meta.get('lastHlc'), []);

  const pendingItems = outboxItems.filter(
    (m) => m.status === undefined || m.status === 'pending'
  );
  const rejectedItems = outboxItems.filter((m) => m.status === 'rejected');

  const lastSyncTimeStr = lastSyncMeta?.value
    ? new Date(lastSyncMeta.value).toLocaleString()
    : status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString()
    : 'Never synced';

  const statusLabel = !isOnline
    ? 'Offline'
    : status.state === 'error'
    ? 'Needs Attention'
    : status.state === 'syncing'
    ? 'Syncing'
    : pendingItems.length > 0
    ? isDemoMode
      ? 'Local Changes'
      : 'Pending Sync'
    : 'Up to Date';

  const statusTone = !isOnline
    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
    : status.state === 'error'
    ? 'bg-red-50 dark:bg-rose-950/60 border-red-200 dark:border-rose-800 text-red-800 dark:text-rose-300'
    : status.state === 'syncing'
    ? 'bg-zinc-100 dark:bg-carbon-elevated border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200'
    : pendingItems.length > 0
    ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
    : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300';

  const summaryMessage = !isOnline
    ? 'This terminal is offline. Sales and stock updates are saved locally and will upload when connectivity returns.'
    : pendingItems.length > 0
    ? `${pendingItems.length} local update${pendingItems.length === 1 ? '' : 's'} queued to sync with the branch server.`
    : 'All terminal sales and inventory updates are backed up and synchronized.';

  return (
    <div className="space-y-5">
      {/* Sync Header Card */}
      <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight">
              Sync Queue & Terminal Status
            </h2>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded border ${statusTone}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{summaryMessage}</p>
        </div>

        <button
          type="button"
          onClick={onManualSync}
          disabled={!isOnline || status.state === 'syncing'}
          data-testid="manual-sync-now-btn"
          className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 text-white dark:text-zinc-950 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw
            className={`w-4 h-4 ${status.state === 'syncing' ? 'animate-spin' : ''}`}
            strokeWidth={1.75}
          />
          <span>{status.state === 'syncing' ? 'Syncing with Server...' : 'Sync Now'}</span>
        </button>
      </div>

      {isDemoMode && onExitDemoMode && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 p-4 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <span>
            Offline Workspace mode is active. Changes are saved to this device&apos;s browser storage
            without sending data to a live server.
          </span>
          <button
            type="button"
            onClick={onExitDemoMode}
            className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon hover:bg-amber-100 dark:hover:bg-zinc-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Switch to Staff Sign In</span>
          </button>
        </div>
      )}

      {/* Error or Auth Required Callout */}
      {status.lastError && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-rose-950/60 border border-red-200 dark:border-rose-800 text-red-900 dark:text-rose-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-rose-400 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="space-y-1">
            <h4 className="font-semibold text-red-950 dark:text-rose-100">Sync Needs Attention</h4>
            <p>{status.lastError}</p>
            {status.consecutiveFailures > 0 && !status.authRequired && (
              <p className="text-red-700 dark:text-rose-300">
                Retrying automatically with backoff (attempt #{status.consecutiveFailures}). Your
                local sales and inventory records remain safe on this terminal.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Plain Staff Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-4 rounded-lg space-y-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} />
            Last Successful Sync
          </span>
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">{lastSyncTimeStr}</div>
        </div>

        <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-4 rounded-lg space-y-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} />
            Pending Changes to Send
          </span>
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
            {pendingItems.length} queued
          </div>
        </div>

        <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-4 rounded-lg space-y-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                rejectedItems.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
              strokeWidth={1.75}
            />
            Items Needing Review
          </span>
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
            {rejectedItems.length === 0
              ? 'None'
              : `${rejectedItems.length} conflict${rejectedItems.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {/* Conflict / Rejected Mutation Review UI */}
      {rejectedItems.length > 0 && (
        <div className="bg-white dark:bg-carbon p-5 rounded-lg border border-amber-300 dark:border-amber-500/60 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
              <span>Updates Rejected by Server ({rejectedItems.length})</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await localRepository.retryAllRejectedMutations(storeId);
                  await onManualSync();
                }}
                disabled={!isOnline || status.state === 'syncing'}
                data-testid="retry-all-rejected-btn"
                className="px-3 py-1.5 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Retry All ({rejectedItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => localRepository.dismissAllRejectedMutations()}
                data-testid="dismiss-all-rejected-btn"
                className="px-3 py-1.5 rounded-md bg-red-50 dark:bg-rose-950/60 hover:bg-red-100 dark:hover:bg-rose-950 border border-red-200 dark:border-rose-800 text-red-700 dark:text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Dismiss All</span>
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            These updates could not be applied automatically on the server. Retry syncing them or
            dismiss them from this queue.
          </p>

          <div className="space-y-2">
            {rejectedItems.map((item) => (
              <div
                key={item.mutationId}
                className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                      {item.type}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400 font-mono">id={item.mutationId.slice(0, 8)}</span>
                  </div>
                  <p className="text-red-700 dark:text-rose-400">{item.lastError || 'Rejected by server'}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await localRepository.retryRejectedMutation(item.mutationId, storeId);
                      await onManualSync();
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-white dark:bg-carbon hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => localRepository.dismissRejectedMutation(item.mutationId)}
                    className="px-2.5 py-1.5 rounded-md bg-red-50 dark:bg-rose-950/60 hover:bg-red-100 dark:hover:bg-rose-950 border border-red-200 dark:border-rose-800 text-red-700 dark:text-rose-300 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Outbox Queue */}
      <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-5 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-600 dark:text-zinc-400" strokeWidth={1.75} />
            <span>Pending Local Updates ({pendingItems.length})</span>
          </h3>
        </div>

        {pendingItems.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-zinc-600 dark:text-zinc-400 flex flex-col items-center gap-2 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md bg-zinc-50 dark:bg-carbon-elevated">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
            <span>Queue is clear. All local sales and inventory changes are synced.</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {pendingItems.map((item) => (
              <div
                key={item.mutationId}
                className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-medium">
                      {item.type}
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium truncate">
                      {formatMutationLabel(item.type, item.payload, item.mutationId)}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    Attempts: {item.attempts}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Collapsed Technical Diagnostics */}
      <details className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg group">
        <summary className="px-5 py-3.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer select-none flex items-center gap-2 list-none hover:bg-zinc-50 dark:hover:bg-zinc-800/60 rounded-lg transition-colors">
          <ChevronRight
            className="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-90"
            strokeWidth={1.75}
          />
          <span>Technical Diagnostics</span>
        </summary>
        <div className="px-5 pb-4 pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-3 text-xs">
          <p className="text-zinc-600 dark:text-zinc-400">
            Protocol: outbox push in idempotent batches of 50 combined with monotonic cursor pull (
            <code className="font-mono text-zinc-900 dark:text-zinc-100">seq &gt; {seqMeta?.value ?? 0}</code>).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="text-zinc-500 dark:text-zinc-400 mb-0.5">Server Pull Cursor (seq)</div>
              <div className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                seq = {seqMeta?.value ?? 0}
              </div>
            </div>
            <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="text-zinc-500 dark:text-zinc-400 mb-0.5">Local Hybrid Logical Clock (HLC)</div>
              <div className="font-mono text-zinc-900 dark:text-zinc-100 truncate">
                {hlcMeta?.value || 'Initialized on first write'}
              </div>
            </div>
          </div>
          {pendingItems.length > 0 && (
            <div className="space-y-1">
              <div className="text-zinc-500 dark:text-zinc-400 font-medium">Queued Mutation IDs & HLC Timestamps</div>
              <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-carbon-elevated p-2.5 rounded border border-zinc-200 dark:border-zinc-800">
                {pendingItems.map((item) => (
                  <div key={item.mutationId} className="truncate">
                    {item.mutationId} | hlc={item.hlc}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
