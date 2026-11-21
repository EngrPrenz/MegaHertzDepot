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
  GitMerge,
  Server,
} from 'lucide-react';

interface SyncStatusPageProps {
  storeId: string;
  isOnline: boolean;
  isDemoMode?: boolean;
  status: SyncStatusSnapshot;
  onManualSync: () => Promise<void>;
  onExitDemoMode?: () => void;
}

export function SyncStatusPage({
  storeId,
  isOnline,
  status,
  onManualSync,
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

  const lastSyncTimeStr =
    lastSyncMeta?.value
      ? new Date(lastSyncMeta.value).toLocaleString()
      : status.lastSyncAt
      ? new Date(status.lastSyncAt).toLocaleString()
      : 'Never synced';

  return (
    <div className="space-y-6">
      {/* Sync Engine Header Card */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">Sync Engine & Outbox Queue</h2>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                !isOnline
                  ? 'bg-amber-950/60 border-amber-700 text-amber-300'
                  : status.state === 'error'
                  ? 'bg-red-950/60 border-red-700 text-red-300'
                  : status.state === 'syncing'
                  ? 'bg-blue-950/60 border-blue-700 text-blue-300'
                  : 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
              }`}
            >
              {!isOnline ? 'OFFLINE' : status.state.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Outbox push (idempotent batches of 50) + monotonic cursor pull (
            <code className="text-amber-400">seq &gt; {seqMeta?.value ?? 0}</code>)
          </p>
        </div>

        <button
          type="button"
          onClick={onManualSync}
          disabled={!isOnline || status.state === 'syncing'}
          data-testid="manual-sync-now-btn"
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer"
        >
          <RefreshCw
            className={`w-4 h-4 ${status.state === 'syncing' ? 'animate-spin' : ''}`}
          />
          <span>{status.state === 'syncing' ? 'Syncing with Server...' : 'Sync Now'}</span>
        </button>
      </div>

      {/* Error or Auth Required Callout */}
      {status.lastError && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/70 text-red-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-white">Sync Needs Attention</h4>
            <p>{status.lastError}</p>
            {status.consecutiveFailures > 0 && !status.authRequired && (
              <p className="text-red-300/80">
                Retrying automatically with exponential backoff + jitter (attempt #
                {status.consecutiveFailures}). Local data remains safe in IndexedDB.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bookkeeping Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-2xl space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            Last Successful Sync
          </span>
          <div className="text-sm font-bold text-white">{lastSyncTimeStr}</div>
        </div>

        <div className="glass-panel p-4 rounded-2xl space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-blue-400" />
            Server Pull Cursor (seq)
          </span>
          <div className="text-sm font-mono font-bold text-white">
            seq = {seqMeta?.value ?? 0}
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <GitMerge className="w-3.5 h-3.5 text-purple-400" />
            Local Hybrid Logical Clock
          </span>
          <div className="text-xs font-mono text-slate-200 truncate">
            {hlcMeta?.value || 'Initialized on first write'}
          </div>
        </div>
      </div>

      {/* Stretch Goal: Conflict / Rejected Mutation Review UI */}
      {rejectedItems.length > 0 && (
        <div className="glass-panel p-5 rounded-2xl border border-amber-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Conflict & Rejected Mutation Review ({rejectedItems.length})</span>
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            These mutations could not be automatically applied by the server. You can retry or
            dismiss them.
          </p>

          <div className="space-y-2">
            {rejectedItems.map((item) => (
              <div
                key={item.mutationId}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-amber-300">{item.type}</span>
                    <span className="text-slate-500 font-mono">
                      id={item.mutationId.slice(0, 8)}
                    </span>
                  </div>
                  <p className="text-red-300">{item.lastError || 'Rejected by server'}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => localRepository.retryRejectedMutation(item.mutationId)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => localRepository.dismissRejectedMutation(item.mutationId)}
                    className="px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Outbox Queue */}
      <div className="glass-panel p-5 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Pending Outbox Mutations ({pendingItems.length})</span>
          </h3>
        </div>

        {pendingItems.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <span>Outbox is completely drained. All local changes are synced!</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {pendingItems.map((item) => (
              <div
                key={item.mutationId}
                className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/70 text-blue-300 font-mono font-medium">
                      {item.type}
                    </span>
                    <span className="font-mono text-slate-400 truncate">
                      {item.payload?.name ||
                        (item.payload?.delta !== undefined
                          ? `delta: ${item.payload.delta > 0 ? `+${item.payload.delta}` : item.payload.delta}`
                          : item.mutationId.slice(0, 8))}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    mutationId: {item.mutationId} • HLC: {item.hlc}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-400">
                    Attempts: {item.attempts}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

