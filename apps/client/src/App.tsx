import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal } from './db/index.js';
import { usePersistentStorage } from './hooks/usePersistentStorage.js';
import { useSyncEngine } from './hooks/useSyncEngine.js';
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
import {
  ShoppingCart,
  Wrench,
  Receipt,
  Database,
  Layers,
  LogOut,
  ClipboardCheck,
  RefreshCw,
  Settings,
  AlertTriangle,
  Store,
  ShieldCheck,
  Globe,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

type RouteMode = 'storefront' | 'pos' | 'admin';

function detectRouteMode(): RouteMode {
  if (typeof window === 'undefined') return 'storefront';
  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();
  const hash = window.location.hash.toLowerCase();

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

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const DEFAULT_STORE_FALLBACK = '22222222-2222-2222-2222-222222222222';

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
  const [isCustomerBuilderOpen, setIsCustomerBuilderOpen] = useState(false);
  const [isPosBuilderOpen, setIsPosBuilderOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Admin Left Sidebar State (persisted collapse preference + mobile drawer state)
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
    { id: storeId, name: 'MegaHertz Depot — Flagship' },
  ]);

  const {
    status: syncStatus,
    isOnline,
    pendingOutboxCount,
    rejectedOutboxCount,
    triggerSync,
  } = useSyncEngine(token && user?.role !== 'customer' ? storeId : null);

  // Listen for browser navigation changes (e.g. forward/back to /pos, /admin, or /product/:id)
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

  const navigateToProduct = (productId: string) => {
    window.history.pushState(null, '', `/product/${productId}`);
    setRouteMode('storefront');
    setActiveProductId(productId);
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Fetch user's stores when online and authenticated, and migrate any orphaned demo data
  useEffect(() => {
    if (!token || token === 'offline_demo_token' || user?.role === 'customer' || !isOnline) {
      return;
    }
    fetch('/stores', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (data?.stores?.length) {
          setStores(data.stores);
          let activeId = storeId;
          if (!data.stores.some((s: any) => s.id === storeId)) {
            activeId = data.stores[0].id;
            setStoreId(activeId);
            localStorage.setItem('countwise_store_id', activeId);
          }
          // Ensure any products/adjustments/orders/outbox created under DEFAULT_STORE_FALLBACK belong to activeId
          if (activeId !== DEFAULT_STORE_FALLBACK) {
            try {
              await localDb.transaction(
                'rw',
                [localDb.products, localDb.adjustments, localDb.orders, localDb.outbox],
                async () => {
                  await localDb.products
                    .where('storeId')
                    .equals(DEFAULT_STORE_FALLBACK)
                    .modify({ storeId: activeId });
                  await localDb.adjustments
                    .where('storeId')
                    .equals(DEFAULT_STORE_FALLBACK)
                    .modify({ storeId: activeId });
                  await localDb.orders
                    .where('storeId')
                    .equals(DEFAULT_STORE_FALLBACK)
                    .modify({ storeId: activeId });
                  await localDb.outbox
                    .where('storeId')
                    .equals(DEFAULT_STORE_FALLBACK)
                    .modify((m) => {
                      m.storeId = activeId;
                      if (m.payload && typeof m.payload === 'object' && 'storeId' in m.payload) {
                        m.payload.storeId = activeId;
                      }
                    });
                }
              );
            } catch {
              // Ignore migration failure
            }
          }
        }
      })
      .catch(() => {
        // Offline or unreachable; keep cached store list
      });
  }, [token, user?.role, isOnline, storeId]);

  // Live queries from Dexie for current store
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

  const handleLogout = () => {
    if (pendingOutboxCount > 0) {
      const confirmed = window.confirm(
        `Warning: You have ${pendingOutboxCount} unsynced offline changes. Logging out will keep them safely in this browser's local storage, but you cannot sync them until you log in again. Continue?`
      );
      if (!confirmed) return;
    }

    localStorage.removeItem('countwise_token');
    localStorage.removeItem('countwise_refresh_token');
    localStorage.removeItem('countwise_user');
    setToken(null);
    setUser(null);
  };

  const handleResolvePublicStoreId = useCallback(
    (resolvedId: string) => {
      if (!token && storeId === DEFAULT_STORE_FALLBACK && resolvedId) {
        setStoreId(resolvedId);
        localStorage.setItem('countwise_store_id', resolvedId);
      }
    },
    [token, storeId]
  );

  const handleAuthSuccess = async (data: {
    accessToken: string;
    user: { id: string; email: string; role?: 'staff' | 'customer' };
    defaultStoreId?: string;
  }) => {
    setToken(data.accessToken);
    setUser(data.user);
    if (data.defaultStoreId) {
      const targetStoreId = data.defaultStoreId;
      // Migrate any data created in Offline Demo Mode (DEFAULT_STORE_FALLBACK) to the real authenticated storeId
      if (targetStoreId !== DEFAULT_STORE_FALLBACK) {
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
                });
            }
          );
        } catch {
          // Ignore migration failure
        }
      }
      setStoreId(targetStoreId);
      localStorage.setItem('countwise_store_id', targetStoreId);
    }
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

  const handleLoadBuildToPosCart = (parts: ProductLocal[]) => {
    const nextCart: CartItem[] = parts.map((product) => ({
      product,
      quantity: 1,
      serialNumbers: [''],
      showSerialInput: false,
    }));
    setExternalCart(nextCart);
    setIsPosBuilderOpen(false);
    navigateToPos();
  };

  const activeStoreName =
    stores.find((s) => s.id === storeId)?.name || 'MegaHertz Depot — Flagship';

  const posCartTotalQty = externalCart.reduce((acc, i) => acc + i.quantity, 0);

  // ================= 1. PUBLIC CONSUMER STOREFRONT ROUTE (`/`, `/product/:id`) =================
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
            onOpenPcBuilder={() => setIsCustomerBuilderOpen(true)}
          />

          <ModalDialog
            open={isCustomerBuilderOpen}
            onClose={() => setIsCustomerBuilderOpen(false)}
            title="Custom PC Rig Builder"
            subtitle="Assemble compatible components and add your entire build to cart"
            maxWidth="6xl"
          >
            <div className="max-h-[82vh] overflow-y-auto pr-1">
              <PcBuilderPage
                storeId={storeId}
                storeName={activeStoreName}
                currencySymbol={currencySymbol}
                  onLoadBuildToCart={(parts) => {
                    const raw = localStorage.getItem('megahertz_customer_cart');
                    const currentCart = safeJsonParse<any[]>(raw, []);
                    const updated = [...currentCart];
                    for (const p of parts) {
                      const idx = updated.findIndex((i: any) => i.product.id === p.id);
                      if (idx >= 0) updated[idx].quantity += 1;
                      else updated.push({ product: p, quantity: 1 });
                    }
                    localStorage.setItem('megahertz_customer_cart', JSON.stringify(updated));
                    window.dispatchEvent(new CustomEvent('megahertz-cart-updated'));
                    setIsCustomerBuilderOpen(false);
                  }}
                />
              </div>
            </ModalDialog>

            <ReloadPrompt />
          </>
        );
      }

      return (
        <>
          <StorefrontPage
            storeId={storeId}
            currencySymbol={currencySymbol}
            onOpenPcBuilder={() => setIsCustomerBuilderOpen(true)}
            onSwitchToStaff={() => navigateToAdmin()}
            onSelectProduct={navigateToProduct}
            onResolvePublicStoreId={handleResolvePublicStoreId}
          />

          {/* Customer Custom PC Builder Modal */}
          <ModalDialog
            open={isCustomerBuilderOpen}
            onClose={() => setIsCustomerBuilderOpen(false)}
            title="Custom PC Rig Builder"
            subtitle="Assemble compatible components and add your entire build to cart"
            maxWidth="6xl"
          >
            <div className="max-h-[82vh] overflow-y-auto pr-1">
              <PcBuilderPage
                storeId={storeId}
                storeName={activeStoreName}
                currencySymbol={currencySymbol}
                onLoadBuildToCart={(parts) => {
                  const raw = localStorage.getItem('megahertz_customer_cart');
                  const currentCart = safeJsonParse<any[]>(raw, []);
                  const updated = [...currentCart];
                  for (const p of parts) {
                    const idx = updated.findIndex((i: any) => i.product.id === p.id);
                    if (idx >= 0) updated[idx].quantity += 1;
                    else updated.push({ product: p, quantity: 1 });
                  }
                  localStorage.setItem('megahertz_customer_cart', JSON.stringify(updated));
                  window.dispatchEvent(new CustomEvent('megahertz-cart-updated'));
                  setIsCustomerBuilderOpen(false);
                }}
              />
            </div>
          </ModalDialog>

          <ReloadPrompt />
        </>
      );
    }

  // Staff / POS / Admin authentication gate
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

  // ================= 2. DEDICATED POS REGISTER ROUTE (`/pos`) =================
  if (routeMode === 'pos') {
    return (
      <div className="min-h-screen flex flex-col bg-stone-950 text-stone-100 selection:bg-amber-500 selection:text-stone-950">
        {/* Dedicated POS Terminal Top Bar */}
        <header className="sticky top-0 z-40 bg-stone-900/90 backdrop-blur-md border-b border-stone-800 px-4 py-3 sm:px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MegaHertzLogo variant="horizontal" size="md" showSubtitle={false} />
              <div className="hidden lg:flex items-center gap-2 border-l border-stone-800 pl-3">
                <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded bg-amber-500 text-stone-950 font-bold tracking-wider">
                  POS Register Terminal
                </span>
                <div className="flex items-center gap-1.5 text-[11px] text-stone-300 bg-stone-950/80 border border-stone-800 rounded-lg px-2.5 py-1">
                  <Store className="w-3.5 h-3.5 text-amber-400" />
                  <select
                    aria-label="Select store"
                    value={storeId}
                    onChange={(e) => handleSelectStore(e.target.value)}
                    className="bg-transparent text-stone-200 font-medium focus:outline-none cursor-pointer"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id} className="bg-stone-900 text-white">
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setIsPosBuilderOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs font-semibold text-stone-200 hover:border-amber-500/40 hover:text-amber-300 transition cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">PC Rig Builder</span>
              </button>

              <button
                type="button"
                onClick={() => navigateToAdmin()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-xs font-semibold text-stone-300 hover:text-white hover:bg-stone-800 transition cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Admin Portal</span>
              </button>

              <button
                type="button"
                onClick={navigateToStorefront}
                title="View Public Customer Storefront"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-xs text-stone-300 hover:text-white hover:bg-stone-800 transition cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">Storefront</span>
              </button>

              <SyncStatusIndicator
                isOnline={isOnline}
                status={syncStatus}
                pendingCount={pendingOutboxCount}
                rejectedCount={rejectedOutboxCount}
                onManualSync={triggerSync}
                onOpenSyncScreen={() => navigateToAdmin('sync')}
              />

              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                title="Terminal & Store Settings"
                className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleLogout}
                title="Log out"
                className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
          {syncStatus.authRequired && (
            <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-700/70 text-amber-200 text-xs flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  Please log in again to sync. Your {pendingOutboxCount} offline changes are safely
                  preserved in IndexedDB.
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold cursor-pointer shrink-0"
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

        {/* POS Custom PC Rig Builder Modal */}
        <ModalDialog
          open={isPosBuilderOpen}
          onClose={() => setIsPosBuilderOpen(false)}
          title="POS Custom PC Rig Builder"
          subtitle="Select compatible parts and load them directly into the POS Register cart"
          maxWidth="6xl"
        >
          <div className="max-h-[82vh] overflow-y-auto pr-1">
            <PcBuilderPage
              storeId={storeId}
              storeName={activeStoreName}
              currencySymbol={currencySymbol}
              onLoadBuildToCart={handleLoadBuildToPosCart}
            />
          </div>
        </ModalDialog>

        {/* Terminal & Branch Settings Modal */}
        <ModalDialog
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          title="POS Terminal & Store Branch Settings"
          maxWidth="4xl"
        >
          <div className="max-h-[82vh] overflow-y-auto pr-1">
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

  // ================= 3. ADMIN INTERFACE (`/admin`, `/staff`) — ALL-IN-ONE COLLAPSIBLE LEFT SIDEBAR =================
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
    <div className="flex flex-col justify-between h-full select-none">
      {/* Top Section: Brand Logo, Collapse Toggle & Active Branch Selector */}
      <div className="p-3.5 space-y-3 border-b border-stone-800/80">
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
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-400 hover:text-white hover:border-amber-500/40 transition cursor-pointer shrink-0"
            >
              {collapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Store Branch Selector & Movements Summary */}
        {!collapsed || isMobile ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-stone-950 text-amber-400 border border-amber-500/30 font-semibold tracking-wider">
                Admin Operations
              </span>
              <span className="flex items-center gap-1 text-[11px] text-stone-400">
                <Layers className="w-3 h-3 text-amber-400" />
                <strong className="text-stone-200 font-mono">{adjustmentCount}</strong> moves
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-stone-300 bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-2">
              <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                aria-label="Select store"
                value={storeId}
                onChange={(e) => handleSelectStore(e.target.value)}
                className="w-full min-w-0 bg-transparent text-stone-200 font-medium focus:outline-none cursor-pointer truncate text-xs"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-stone-900 text-white">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div
            title={`Active Branch: ${activeStoreName} (${adjustmentCount} movements)`}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-stone-950 border border-stone-800 text-amber-400"
          >
            <Store className="w-4 h-4" />
            <span className="text-[9px] font-mono text-stone-400 mt-0.5">{adjustmentCount}</span>
          </div>
        )}
      </div>

      {/* Middle Section: 4 Core Admin Operations */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        {(!collapsed || isMobile) && (
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Management Views
          </div>
        )}

        <nav className="space-y-1.5" aria-label="Admin navigation">
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
                  collapsed && !isMobile ? 'justify-center px-2 py-3' : 'justify-between px-3.5 py-2.5'
                } rounded-xl text-xs font-semibold transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800/70'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                </div>

                {item.badge !== undefined && (!collapsed || isMobile) && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                      isActive
                        ? 'bg-stone-950/20 text-stone-950'
                        : item.badgeHighlight
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-stone-800 text-stone-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {item.badge !== undefined && collapsed && !isMobile && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Portal Switchers, Sync Status, Settings & Account */}
      <div className="p-3 border-t border-stone-800/80 space-y-2.5 bg-stone-950/40">
        {(!collapsed || isMobile) && (
          <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Portals & System
          </div>
        )}

        {/* Dedicated POS Register Launcher */}
        <button
          type="button"
          onClick={navigateToPos}
          data-testid="open-pos-route-btn"
          title={collapsed && !isMobile ? 'Launch POS Register (/pos)' : undefined}
          className={`w-full flex items-center ${
            collapsed && !isMobile ? 'justify-center p-2.5' : 'justify-between px-3.5 py-2.5'
          } rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-stone-950 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer group`}
        >
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="w-4 h-4 shrink-0" />
            {(!collapsed || isMobile) && <span>POS Register</span>}
          </div>
          {posCartTotalQty > 0 && (!collapsed || isMobile) && (
            <span className="px-1.5 py-0.2 rounded-full bg-stone-950 text-amber-400 text-[10px] font-mono">
              {posCartTotalQty}
            </span>
          )}
        </button>

        {/* Customer Storefront Switcher */}
        <button
          type="button"
          onClick={navigateToStorefront}
          title={collapsed && !isMobile ? 'View Public Storefront (/)' : undefined}
          className={`w-full flex items-center ${
            collapsed && !isMobile ? 'justify-center p-2.5' : 'gap-2.5 px-3.5 py-2'
          } rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-medium text-stone-300 hover:text-white transition cursor-pointer`}
        >
          <Globe className="w-4 h-4 text-amber-400 shrink-0" />
          {(!collapsed || isMobile) && <span>View Storefront</span>}
        </button>

        {/* Sync Status Widget */}
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
            className="w-full flex justify-center p-2 rounded-xl bg-stone-900 border border-stone-800 text-xs cursor-pointer"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                !isOnline
                  ? 'bg-stone-500'
                  : rejectedOutboxCount > 0
                  ? 'bg-rose-500'
                  : pendingOutboxCount > 0
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-emerald-400'
              }`}
            />
          </button>
        )}

        {/* Settings & Account Footer */}
        <div
          className={`pt-2 border-t border-stone-800/80 flex items-center ${
            collapsed && !isMobile ? 'flex-col gap-2' : 'justify-between gap-2'
          }`}
        >
          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-stone-200 truncate">
                {user.email}
              </div>
              <div className="text-[10px] text-stone-500">Store Administrator</div>
            </div>
          )}

          <div className={`flex items-center ${collapsed && !isMobile ? 'flex-col' : ''} gap-1.5`}>
            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              title="Store & Terminal Settings"
              data-testid="open-settings-btn"
              className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-rose-400 hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-stone-950 text-stone-100 selection:bg-amber-500 selection:text-stone-950">
      {/* Desktop Sticky Collapsible Left Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen bg-stone-900/95 border-r border-stone-800 transition-all duration-200 z-40 ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {renderAdminSidebarContent(isSidebarCollapsed, false)}
      </aside>

      {/* Mobile Top Bar (< lg) */}
      <header className="lg:hidden sticky top-0 z-40 bg-stone-900/95 backdrop-blur-md border-b border-stone-800 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open navigation menu"
            className="p-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-300 hover:text-white cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
          <MegaHertzLogo variant="horizontal" size="sm" showSubtitle={false} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={navigateToPos}
            className="px-3 py-1.5 rounded-xl bg-amber-500 text-stone-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>POS</span>
          </button>
        </div>
      </header>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-stone-900 border-r border-stone-800 z-10">
            {renderAdminSidebarContent(false, true)}
          </aside>
        </div>
      )}

      {/* Main Content Area (100% full vertical height on desktop) */}
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-5">
        {/* Session Expired Re-login Prompt (Section 9: never delete local data) */}
        {syncStatus.authRequired && (
          <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-700/70 text-amber-200 text-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                Please log in again to sync. Your {pendingOutboxCount} offline changes are safely
                preserved in IndexedDB.
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold cursor-pointer shrink-0"
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

      {/* Store & Terminal Settings Modal */}
      <ModalDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Store Branch & Terminal Settings"
        maxWidth="4xl"
      >
        <div className="max-h-[82vh] overflow-y-auto pr-1">
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

      {/* Service Worker Update Prompt */}
      <ReloadPrompt />
    </div>
  );
}
