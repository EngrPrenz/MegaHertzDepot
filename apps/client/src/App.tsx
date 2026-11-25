import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb } from './db/index.js';
import { usePersistentStorage } from './hooks/usePersistentStorage.js';
import { useSyncEngine } from './hooks/useSyncEngine.js';
import {
  syncPublicCatalog,
  safeJsonParse,
  PUBLIC_CATALOG_REFRESH_EVENT,
  DEFAULT_STORE_FALLBACK,
} from './services/publicCatalogSync.js';
import { SyncStatusIndicator } from './components/SyncStatusIndicator.js';
import { ReloadPrompt } from './components/ReloadPrompt.js';
import { AuthPage } from './pages/AuthPage.js';
import { PosRegisterPage, CartItem } from './pages/PosRegisterPage.js';
import { PcBuilderPage } from './pages/PcBuilderPage.js';
import { SalesOrdersPage } from './pages/SalesOrdersPage.js';
import { InventoryPage } from './pages/InventoryPage.js';
import { QuickCountPage } from './pages/QuickCountPage.js';
import { SyncStatusPage } from './pages/SyncStatusPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { StorefrontPage } from './pages/StorefrontPage.js';
import { ProductDetailPage } from './pages/ProductDetailPage.js';
import { ModalDialog } from './components/ModalDialog.js';
import { MegaHertzLogo } from './components/MegaHertzLogo.js';
import { ThemeToggleButton } from './components/ThemeToggleButton.js';
import {
  ShoppingCart,
  Receipt,
  Database,
  Layers,
  LogOut,
  ClipboardCheck,
  RefreshCw,
  Settings,
  AlertTriangle,
  Store,
  Globe,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

type RouteMode = 'storefront' | 'builder' | 'pos' | 'admin';

function detectRouteMode(): RouteMode {
  if (typeof window === 'undefined') return 'storefront';
  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (
    path === '/builder' ||
    path === '/pc-builder' ||
    path.startsWith('/builder/') ||
    search.includes('portal=builder') ||
    hash === '#builder' ||
    hash === '#/builder'
  ) {
    return 'builder';
  }

  if (
    path === '/pos' ||
    path === '/register' ||
    path.startsWith('/pos/') ||
    search.includes('portal=pos') ||
    hash === '#pos' ||
    hash === '#/pos'
  ) {
    return 'pos';
  }

  if (
    path === '/staff' ||
    path === '/portal' ||
    path === '/admin' ||
    path.startsWith('/staff/') ||
    path.startsWith('/admin/') ||
    search.includes('portal=staff') ||
    search.includes('admin=true') ||
    hash.includes('staff') ||
    hash.includes('admin')
  ) {
    return 'admin';
  }

  return 'storefront';
}

function getProductIdFromRoute(): string | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  if (path.startsWith('/product/')) {
    const id = decodeURIComponent(path.replace('/product/', '').trim());
    return id || null;
  }
  return null;
}

async function migrateFallbackStoreData(targetStoreId: string): Promise<void> {
  if (!targetStoreId || targetStoreId === DEFAULT_STORE_FALLBACK) return;
  try {
    await localDb.transaction(
      'rw',
      [localDb.products, localDb.adjustments, localDb.orders, localDb.outbox],
      async () => {
        await localDb.products
          .where('storeId')
          .equals(DEFAULT_STORE_FALLBACK)
          .modify({ storeId: targetStoreId });
        await localDb.adjustments
          .where('storeId')
          .equals(DEFAULT_STORE_FALLBACK)
          .modify({ storeId: targetStoreId });
        await localDb.orders
          .where('storeId')
          .equals(DEFAULT_STORE_FALLBACK)
          .modify({ storeId: targetStoreId });
        await localDb.outbox
          .where('storeId')
          .equals(DEFAULT_STORE_FALLBACK)
          .modify((m) => {
            m.storeId = targetStoreId;
            if (m.payload && typeof m.payload === 'object' && 'storeId' in m.payload) {
              m.payload.storeId = targetStoreId;
            }
            if (m.status === 'rejected' && m.lastError?.includes('does not belong to target store')) {
              m.status = 'pending';
              m.attempts = 0;
              m.lastError = undefined;
            }
          });
      }
    );
  } catch {
    // Ignore migration failure
  }
}

type AdminTab = 'sales' | 'inventory' | 'quick-count' | 'sync';

export function App() {
  const isStoragePersisted = usePersistentStorage();

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('countwise_token'));
  const [user, setUser] = useState<{
    id: string;
    email: string;
    role?: 'staff' | 'customer';
  } | null>(() => safeJsonParse(localStorage.getItem('countwise_user'), null));
  const [storeId, setStoreId] = useState<string>(() => {
    return localStorage.getItem('countwise_store_id') || DEFAULT_STORE_FALLBACK;
  });

  const [routeMode, setRouteMode] = useState<RouteMode>(() => detectRouteMode());
  const [activeTab, setActiveTab] = useState<AdminTab>('sales');
  const [externalCart, setExternalCart] = useState<CartItem[]>([]);
  const [activeProductId, setActiveProductId] = useState<string | null>(() => getProductIdFromRoute());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('megahertz_admin_sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('megahertz_admin_sidebar_collapsed', String(next));
      return next;
    });
  };

  const [lowStockThreshold, setLowStockThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('countwise_low_stock');
    return saved ? parseInt(saved, 10) || 3 : 3;
  });

  const [currencySymbol, setCurrencySymbol] = useState<string>(() => {
    return localStorage.getItem('megahertz_currency') || '₱';
  });

  const [stores, setStores] = useState<Array<{ id: string; name: string; role?: string }>>(() => [
    { id: storeId, name: 'MegaHertz Depot Flagship' },
  ]);
  const [verifiedStoreIds, setVerifiedStoreIds] = useState<string[]>([]);

  const syncTargetStoreId =
    token &&
    token !== 'offline_demo_token' &&
    user?.role !== 'customer' &&
    storeId &&
    storeId !== DEFAULT_STORE_FALLBACK &&
    verifiedStoreIds.includes(storeId)
      ? storeId
      : null;

  const {
    status: syncStatus,
    isOnline,
    pendingOutboxCount,
    rejectedOutboxCount,
    triggerSync,
  } = useSyncEngine(syncTargetStoreId);

  useEffect(() => {
    const handlePopState = () => {
      setRouteMode(detectRouteMode());
      setActiveProductId(getProductIdFromRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToPos = () => {
    window.history.pushState(null, '', '/pos');
    setRouteMode('pos');
    setActiveProductId(null);
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToAdmin = (tab?: AdminTab) => {
    window.history.pushState(null, '', '/admin');
    setRouteMode('admin');
    if (tab) setActiveTab(tab);
    setActiveProductId(null);
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToStorefront = () => {
    window.history.pushState(null, '', '/');
    setRouteMode('storefront');
    setActiveProductId(null);
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToBuilder = () => {
    window.history.pushState(null, '', '/builder');
    setRouteMode('builder');
    setActiveProductId(null);
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToProduct = (productId: string) => {
    window.history.pushState(null, '', `/product/${productId}`);
    setRouteMode('storefront');
    setActiveProductId(productId);
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!token || token === 'offline_demo_token' || user?.role === 'customer' || !isOnline) {
      return;
    }
    let cancelled = false;
    fetch('/stores', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (cancelled || !data?.stores?.length) return;
        const serverIds: string[] = data.stores.map((s: any) => s.id);
        setStores(data.stores);

        const currentId = localStorage.getItem('countwise_store_id') || storeId;
        let activeId = currentId;
        if (!serverIds.includes(currentId)) {
          activeId = data.stores[0].id;
          localStorage.setItem('countwise_store_id', activeId);
          setStoreId(activeId);
        }

        await migrateFallbackStoreData(activeId);
        if (!cancelled) {
          setVerifiedStoreIds(serverIds);
        }
      })
      .catch(() => {
        // Offline or unreachable; keep cached store list
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.role, isOnline]);

  const activeProductCount = useLiveQuery(
    () =>
      localDb.products
        .where('storeId')
        .equals(storeId)
        .filter((p) => !p.deletedAt)
        .count(),
    [storeId],
    0
  );

  const orderCount = useLiveQuery(
    () => localDb.orders.where('storeId').equals(storeId).count(),
    [storeId],
    0
  );

  const adjustmentCount = useLiveQuery(
    () => localDb.adjustments.where('storeId').equals(storeId).count(),
    [storeId],
    0
  );

  const handleLogout = async () => {
    if (pendingOutboxCount > 0) {
      const confirmed = window.confirm(
        `Warning: You have ${pendingOutboxCount} unsynced offline changes. Logging out will keep them safely in this browser's local storage, but you cannot sync them until you log in again. Continue?`
      );
      if (!confirmed) return;
    } else {
      try {
        await localDb.transaction(
          'rw',
          [localDb.products, localDb.orders, localDb.adjustments, localDb.outbox, localDb.meta],
          async () => {
            await Promise.all([
              localDb.orders.clear(),
              localDb.adjustments.clear(),
              localDb.outbox.clear(),
              localDb.meta.clear(),
              localDb.products.toCollection().modify((prod) => {
                delete prod.costPrice;
              }),
            ]);
          }
        );
      } catch {
        // Ignore IndexedDB cleanup error during sign-out
      }
    }

    localStorage.removeItem('countwise_token');
    localStorage.removeItem('countwise_refresh_token');
    localStorage.removeItem('countwise_user');
    localStorage.removeItem('countwise_store_id');
    setToken(null);
    setUser(null);
    setStoreId(DEFAULT_STORE_FALLBACK);
    setVerifiedStoreIds([]);
  };

  const handleResolvePublicStoreId = useCallback(
    (resolvedId: string) => {
      if (!token && resolvedId && resolvedId !== storeId) {
        setStoreId(resolvedId);
        localStorage.setItem('countwise_store_id', resolvedId);
      }
    },
    [token, storeId]
  );

  // Sync public storefront catalog + stock whenever viewing customer routes (/ , /product/:id , /builder)
  useEffect(() => {
    if (routeMode !== 'storefront' && routeMode !== 'builder') return;
    let cancelled = false;

    const runSync = () => {
      if (cancelled) return;
      void syncPublicCatalog(storeId, {
        allowAutoResolve: !token,
        onResolvePublicStoreId: (resolvedId) => {
          if (!cancelled) handleResolvePublicStoreId(resolvedId);
        },
      });
    };

    runSync();
    window.addEventListener('online', runSync);
    window.addEventListener(PUBLIC_CATALOG_REFRESH_EVENT, runSync);

    return () => {
      cancelled = true;
      window.removeEventListener('online', runSync);
      window.removeEventListener(PUBLIC_CATALOG_REFRESH_EVENT, runSync);
    };
  }, [routeMode, storeId, token, handleResolvePublicStoreId]);

  const handleAuthSuccess = async (data: {
    accessToken: string;
    user: { id: string; email: string; role?: 'staff' | 'customer' };
    defaultStoreId?: string;
  }) => {
    if (data.accessToken === 'offline_demo_token') {
      setVerifiedStoreIds([]);
      setStoreId(data.defaultStoreId || DEFAULT_STORE_FALLBACK);
      setUser(data.user);
      setToken(data.accessToken);
      return;
    }

    if (data.defaultStoreId) {
      await migrateFallbackStoreData(data.defaultStoreId);
      localStorage.setItem('countwise_store_id', data.defaultStoreId);
      setStoreId(data.defaultStoreId);
      setVerifiedStoreIds((prev) =>
        prev.includes(data.defaultStoreId!) ? prev : [...prev, data.defaultStoreId!]
      );
    }

    setUser(data.user);
    setToken(data.accessToken);
  };

  const handleSelectStore = (nextStoreId: string) => {
    setStoreId(nextStoreId);
    localStorage.setItem('countwise_store_id', nextStoreId);
  };

  const handleCreateStore = async (name: string) => {
    if (token && token !== 'offline_demo_token' && isOnline) {
      const res = await fetch('/stores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        setStores((prev) => [...prev, data.store]);
        setVerifiedStoreIds((prev) =>
          prev.includes(data.store.id) ? prev : [...prev, data.store.id]
        );
        handleSelectStore(data.store.id);
        return;
      }
    }
    const localId = crypto.randomUUID();
    setStores((prev) => [...prev, { id: localId, name }]);
    handleSelectStore(localId);
  };

  const handleChangeLowStock = (val: number) => {
    setLowStockThreshold(val);
    localStorage.setItem('countwise_low_stock', String(val));
  };

  const handleChangeCurrency = (sym: string) => {
    setCurrencySymbol(sym);
    localStorage.setItem('megahertz_currency', sym);
  };

  const activeStoreName =
    stores.find((s) => s.id === storeId)?.name || 'MegaHertz Depot Flagship';

  const posCartTotalQty = externalCart.reduce((acc, i) => acc + i.quantity, 0);

  // ================= 1. PUBLIC STOREFRONT & FULL-PAGE RIG BUILDER =================
  if (routeMode === 'builder') {
    return (
      <>
        <PcBuilderPage
          storeId={storeId}
          storeName={activeStoreName}
          currencySymbol={currencySymbol}
          onBack={navigateToStorefront}
        />
        <ReloadPrompt />
      </>
    );
  }

  if (routeMode === 'storefront') {
    if (activeProductId) {
      return (
        <>
          <ProductDetailPage
            productId={activeProductId}
            storeId={storeId}
            currencySymbol={currencySymbol}
            onBack={navigateToStorefront}
            onSelectProduct={navigateToProduct}
            onOpenPcBuilder={navigateToBuilder}
          />
          <ReloadPrompt />
        </>
      );
    }

    return (
      <>
        <StorefrontPage
          storeId={storeId}
          currencySymbol={currencySymbol}
          onOpenPcBuilder={navigateToBuilder}
          onSwitchToStaff={() => navigateToAdmin()}
          onSelectProduct={navigateToProduct}
          onResolvePublicStoreId={handleResolvePublicStoreId}
        />
        <ReloadPrompt />
      </>
    );
  }

  // ================= 2. STAFF AUTH GATE =================
  if (!token || !user || user.role === 'customer') {
    return (
      <>
        <AuthPage
          onAuthSuccess={handleAuthSuccess}
          onBackToStorefront={navigateToStorefront}
        />
        <ReloadPrompt />
      </>
    );
  }

  // ================= 3. DEDICATED POS REGISTER ROUTE (`/pos`) =================
  if (routeMode === 'pos') {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
        <header className="sticky top-0 z-40 bg-white dark:bg-carbon border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 sm:px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MegaHertzLogo variant="horizontal" size="md" showSubtitle={false} />
              <div className="hidden lg:flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40">
                  POS Register
                </span>
                <div className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 rounded px-2.5 py-1">
                  <Store className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                  <select
                    aria-label="Select store"
                    value={storeId}
                    onChange={(e) => handleSelectStore(e.target.value)}
                    className="bg-transparent text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none cursor-pointer"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id} className="bg-white dark:bg-carbon text-zinc-950 dark:text-zinc-50">
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SyncStatusIndicator
                isOnline={isOnline}
                status={syncStatus}
                pendingCount={pendingOutboxCount}
                rejectedCount={rejectedOutboxCount}
                onManualSync={triggerSync}
                onOpenSyncScreen={() => navigateToAdmin('sync')}
              />

              <ThemeToggleButton />

              <button
                type="button"
                onClick={() => navigateToAdmin()}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer transition-colors"
              >
                Admin
              </button>

              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                title="Terminal & Store Settings"
                aria-label="Terminal and Store Settings"
                className="p-2 rounded-md bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4" strokeWidth={1.75} />
              </button>

              <button
                type="button"
                onClick={handleLogout}
                title="Log out"
                aria-label="Log out"
                className="p-2 rounded-md bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
          {syncStatus.authRequired && (
            <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" strokeWidth={1.75} />
                <span>
                  Please sign in again to sync. Your {pendingOutboxCount} offline changes remain
                  safely stored in this browser.
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-md bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold cursor-pointer shrink-0"
              >
                Sign In Again
              </button>
            </div>
          )}

          <PosRegisterPage
            storeId={storeId}
            storeName={activeStoreName}
            userId={user.id}
            lowStockThreshold={lowStockThreshold}
            currencySymbol={currencySymbol}
            externalCart={externalCart}
            setExternalCart={setExternalCart}
          />
        </main>

        <ModalDialog
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          title="POS Terminal & Store Settings"
          maxWidth="4xl"
        >
          <div className="max-h-[80vh] overflow-y-auto pr-1">
            <SettingsPage
              user={user}
              currentStoreId={storeId}
              stores={stores}
              onSelectStore={handleSelectStore}
              onCreateStore={handleCreateStore}
              lowStockThreshold={lowStockThreshold}
              onChangeLowStockThreshold={handleChangeLowStock}
              currencySymbol={currencySymbol}
              onChangeCurrencySymbol={handleChangeCurrency}
              isStoragePersisted={Boolean(isStoragePersisted)}
            />
          </div>
        </ModalDialog>

        <ReloadPrompt />
      </div>
    );
  }

  // ================= 4. ADMIN OPERATIONS INTERFACE (`/admin`, `/staff`) =================
  const adminNavItems: Array<{
    id: AdminTab;
    label: string;
    testId: string;
    icon: typeof Receipt;
    badge?: number;
    badgeHighlight?: boolean;
  }> = [
    {
      id: 'sales',
      label: 'Sales & Warranty',
      testId: 'tab-sales',
      icon: Receipt,
      badge: orderCount,
    },
    {
      id: 'inventory',
      label: 'Hardware Inventory',
      testId: 'tab-inventory',
      icon: Database,
      badge: activeProductCount,
    },
    {
      id: 'quick-count',
      label: 'Quick Count',
      testId: 'tab-quick-count',
      icon: ClipboardCheck,
    },
    {
      id: 'sync',
      label: 'Sync & Outbox',
      testId: 'tab-sync',
      icon: RefreshCw,
      badge: pendingOutboxCount > 0 ? pendingOutboxCount : undefined,
      badgeHighlight: pendingOutboxCount > 0,
    },
  ];

  const renderAdminSidebarContent = (collapsed: boolean, isMobile = false) => (
    <div className="flex flex-col justify-between h-full">
      <div className="p-3.5 space-y-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          {collapsed && !isMobile ? (
            <div className="mx-auto">
              <MegaHertzLogo variant="icon" size="sm" />
            </div>
          ) : (
            <MegaHertzLogo variant="horizontal" size="sm" showSubtitle={false} />
          )}

          {isMobile ? (
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Close navigation menu"
              className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors cursor-pointer shrink-0"
            >
              {collapsed ? (
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
              )}
            </button>
          )}
        </div>

        {!collapsed || isMobile ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40 font-medium">
                Admin Operations
              </span>
              <span className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 tabular-nums">
                <Layers className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} />
                <strong className="text-zinc-950 dark:text-zinc-50 font-mono">{adjustmentCount}</strong> moves
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 rounded px-2.5 py-1.5">
              <Store className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" strokeWidth={1.75} />
              <select
                aria-label="Select store"
                value={storeId}
                onChange={(e) => handleSelectStore(e.target.value)}
                className="w-full min-w-0 bg-transparent text-zinc-950 dark:text-zinc-50 font-medium focus:outline-none cursor-pointer truncate text-xs"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-white dark:bg-carbon text-zinc-950 dark:text-zinc-50">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div
            title={`Active Branch: ${activeStoreName} (${adjustmentCount} movements)`}
            className="flex flex-col items-center justify-center p-2 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
          >
            <Store className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
            <span className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 mt-0.5 tabular-nums">{adjustmentCount}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <nav className="space-y-1" aria-label="Admin navigation">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileSidebarOpen(false);
                }}
                data-testid={item.testId}
                title={collapsed && !isMobile ? item.label : undefined}
                className={`w-full flex items-center ${
                  collapsed && !isMobile ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2'
                } rounded-md text-xs font-medium transition-colors cursor-pointer relative ${
                  isActive
                    ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400 dark:text-amber-600' : 'text-zinc-500 dark:text-zinc-400'}`}
                    strokeWidth={1.75}
                  />
                  {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                </div>

                {item.badge !== undefined && (!collapsed || isMobile) && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tabular-nums shrink-0 ${
                      isActive
                        ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-950'
                        : item.badgeHighlight
                        ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40'
                        : 'bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {item.badge !== undefined && collapsed && !isMobile && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2 bg-zinc-50 dark:bg-zinc-950/60">
        <button
          type="button"
          onClick={navigateToPos}
          data-testid="open-pos-route-btn"
          title={collapsed && !isMobile ? 'Launch POS Register (/pos)' : undefined}
          className={`w-full flex items-center ${
            collapsed && !isMobile ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
          } rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold transition-colors cursor-pointer`}
        >
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {(!collapsed || isMobile) && <span>POS Register</span>}
          </div>
          {posCartTotalQty > 0 && (!collapsed || isMobile) && (
            <span className="px-1.5 py-0.2 rounded bg-zinc-950 text-white text-[10px] font-mono tabular-nums">
              {posCartTotalQty}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={navigateToStorefront}
          title={collapsed && !isMobile ? 'View Public Storefront (/)' : undefined}
          className={`w-full flex items-center ${
            collapsed && !isMobile ? 'justify-center p-2' : 'gap-2 px-3 py-2'
          } rounded-md bg-white dark:bg-carbon hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer`}
        >
          <Globe className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" strokeWidth={1.75} />
          {(!collapsed || isMobile) && <span>View Storefront</span>}
        </button>

        {!collapsed || isMobile ? (
          <div className="pt-1 flex justify-center">
            <SyncStatusIndicator
              isOnline={isOnline}
              status={syncStatus}
              pendingCount={pendingOutboxCount}
              rejectedCount={rejectedOutboxCount}
              onManualSync={triggerSync}
              onOpenSyncScreen={() => {
                setActiveTab('sync');
                setIsMobileSidebarOpen(false);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            title={isOnline ? `Online (${pendingOutboxCount} pending)` : 'Offline'}
            aria-label="Open Sync status"
            className="w-full flex justify-center p-2 rounded-md bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-700 text-xs cursor-pointer"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                !isOnline
                  ? 'bg-zinc-400'
                  : rejectedOutboxCount > 0
                  ? 'bg-rose-600'
                  : pendingOutboxCount > 0
                  ? 'bg-amber-500'
                  : 'bg-emerald-600'
              }`}
            />
          </button>
        )}

        <div
          className={`pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center ${
            collapsed && !isMobile ? 'flex-col gap-2' : 'justify-between gap-2'
          }`}
        >
          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {user.email}
              </div>
              <div className="text-[10px] text-zinc-600 dark:text-zinc-400">Store Administrator</div>
            </div>
          )}

          <div className={`flex items-center ${collapsed && !isMobile ? 'flex-col' : ''} gap-1`}>
            <ThemeToggleButton />

            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              title="Store & Terminal Settings"
              aria-label="Store and Terminal Settings"
              data-testid="open-settings-btn"
              className="p-1.5 rounded-md bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              className="p-1.5 rounded-md bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
      <aside
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen bg-white dark:bg-carbon border-r border-zinc-200 dark:border-zinc-800 transition-all duration-150 z-40 ${
          isSidebarCollapsed ? 'w-18' : 'w-64'
        }`}
      >
        {renderAdminSidebarContent(isSidebarCollapsed, false)}
      </aside>

      <header className="lg:hidden sticky top-0 z-40 bg-white dark:bg-carbon border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open navigation menu"
            className="p-1.5 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
          >
            <Menu className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <MegaHertzLogo variant="horizontal" size="sm" showSubtitle={false} />
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggleButton />
          <button
            type="button"
            onClick={navigateToPos}
            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>POS</span>
          </button>
        </div>
      </header>

      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-zinc-950/45 dark:bg-black/70"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-carbon border-r border-zinc-200 dark:border-zinc-800 z-10 shadow-xl">
            {renderAdminSidebarContent(false, true)}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
        {syncStatus.authRequired && (
          <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" strokeWidth={1.75} />
              <span>
                Please sign in again to sync. Your {pendingOutboxCount} offline changes remain safely
                preserved in IndexedDB.
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-md bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold cursor-pointer shrink-0"
            >
              Sign In Again
            </button>
          </div>
        )}

        {activeTab === 'sales' && (
          <SalesOrdersPage
            storeId={storeId}
            storeName={activeStoreName}
            currencySymbol={currencySymbol}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryPage
            storeId={storeId}
            userId={user.id}
            lowStockThreshold={lowStockThreshold}
            currencySymbol={currencySymbol}
          />
        )}

        {activeTab === 'quick-count' && (
          <QuickCountPage storeId={storeId} userId={user.id} />
        )}

        {activeTab === 'sync' && (
          <SyncStatusPage
            storeId={storeId}
            isOnline={isOnline}
            isDemoMode={token === 'offline_demo_token'}
            status={syncStatus}
            onManualSync={triggerSync}
            onExitDemoMode={handleLogout}
          />
        )}
      </main>

      <ModalDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Store Branch & Terminal Settings"
        maxWidth="4xl"
      >
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          <SettingsPage
            user={user}
            currentStoreId={storeId}
            stores={stores}
            onSelectStore={handleSelectStore}
            onCreateStore={handleCreateStore}
            lowStockThreshold={lowStockThreshold}
            onChangeLowStockThreshold={handleChangeLowStock}
            currencySymbol={currencySymbol}
            onChangeCurrencySymbol={handleChangeCurrency}
            isStoragePersisted={Boolean(isStoragePersisted)}
          />
        </div>
      </ModalDialog>

      <ReloadPrompt />
    </div>
  );
}
