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
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full mx-auto p-4 rounded-xl glass-panel shadow-2xl border border-slate-700/80 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5">
          {needRefresh ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-white">
            {needRefresh ? 'Update Available' : 'Offline Mode Ready'}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            {needRefresh
              ? 'A new version of Countwise is ready. Reload to apply updates.'
              : 'Countwise has been cached and will function fully without internet.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {needRefresh && (
              <button
                onClick={() => updateServiceWorker(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors shadow-sm"
              >
                Reload Now
              </button>
            )}
            <button
              onClick={close}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          onClick={close}
          className="text-slate-500 hover:text-slate-300 p-1 rounded-md transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
