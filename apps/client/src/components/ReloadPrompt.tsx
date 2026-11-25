import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Download } from 'lucide-react';

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100%-2rem)] mx-auto p-4 rounded-lg bg-white dark:bg-carbon shadow-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-zinc-100 dark:bg-carbon-elevated text-zinc-900 dark:text-zinc-100 shrink-0">
          {needRefresh ? (
            <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-400" strokeWidth={1.75} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {needRefresh ? 'Update Available' : 'Offline Mode Ready'}
          </h4>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
            {needRefresh
              ? 'A new version of MegaHertz Depot is ready. Reload to apply updates.'
              : 'MegaHertz Depot is cached and ready to work offline.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {needRefresh && (
              <button
                type="button"
                onClick={() => updateServiceWorker(true)}
                className="px-3 py-1.5 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 rounded-md text-xs font-medium cursor-pointer transition-colors"
              >
                Reload Now
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="px-3 py-1.5 bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-md text-xs font-medium cursor-pointer transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss notification"
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white p-1 rounded transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
