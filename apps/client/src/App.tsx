import { useState, useEffect } from 'react';
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
import { AdminPage } from './pages/AdminPage.js';
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
} from 'lucide-react';

function checkIsStaffRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return (
    path === '/staff' ||
    path === '/portal' ||
    path === '/admin' ||
    path.startsWith('/staff/') ||
    path.startsWith('/admin/') ||
    search.includes('portal=staff') ||
    search.includes('admin=true') ||
    hash.includes('staff') ||
    hash.includes('admin')
  );
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

const DEFAULT_STORE_FALLBACK = '22222222-2222-2222-2222-222222222222';

type AppTab =
  | 'pos'
  | 'builder'
  | 'sales'
  | 'inventory'
  | 'admin'
  | 'quick-count'
  | 'sync'
  | 'settings';

export function App() {
  const isStoragePersisted = usePersistentStorage();

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('countwise_token'));
  const [user, setUser] = useState<{ id: string; email: string } | null>(() => {
    const raw = localStorage.getItem('countwise_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [storeId, setStoreId] = useState<string>(() => {
    return localStorage.getItem('countwise_store_id') || DEFAULT_STORE_FALLBACK;
  });

  const [activeTab, setActiveTab] = useState<AppTab>('pos');
  const [externalCart, setExternalCart] = useState<CartItem[]>([]);
  const [isStaffMode, setIsStaffMode] = useState<boolean>(() => checkIsStaffRoute());
  const [activeProductId, setActiveProductId] = useState<string | null>(() => getProductIdFromRoute());
  const [isCustomerBuilderOpen, setIsCustomerBuilderOpen] = useState(false);

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
  } = useSyncEngine(token && token !== 'offline_demo_token' ? storeId : null);

  // Listen for browser navigation changes (e.g. forward/back to /staff or /product/:id)
  useEffect(() => {
    const handlePopState = () => {
      setIsStaffMode(checkIsStaffRoute());
      setActiveProductId(getProductIdFromRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToStaff = () => {
    window.history.pushState(null, '', '/staff');
    setIsStaffMode(true);
    setActiveProductId(null);
  };

  const navigateToStorefront = () => {
    window.history.pushState(null, '', '/');
    setIsStaffMode(false);
    setActiveProductId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToProduct = (productId: string) => {
    window.history.pushState(null, '', `/product/${productId}`);
    setActiveProductId(productId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Fetch user's stores when online and authenticated
  useEffect(() => {
    if (!token || token === 'offline_demo_token' || !isOnline) return;
    fetch('/stores', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.stores?.length) {
          setStores(data.stores);
          if (!data.stores.some((s: any) => s.id === storeId)) {
            const firstId = data.stores[0].id;
            setStoreId(firstId);
            localStorage.setItem('countwise_store_id', firstId);
          }
        }
      })
      .catch(() => {
        // Offline or unreachable; keep cached store list
      });
  }, [token, isOnline, storeId]);

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
    // Non-destructive logout protection: warning if unsynced data remains (Section 9)
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

  const handleAuthSuccess = (data: {
    accessToken: string;
    user: { id: string; email: string };
    defaultStoreId?: string;
  }) => {
    setToken(data.accessToken);
    setUser(data.user);
    if (data.defaultStoreId) {
      setStoreId(data.defaultStoreId);
      localStorage.setItem('countwise_store_id', data.defaultStoreId);
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

  const handleLoadBuildToCart = (parts: ProductLocal[]) => {
    const nextCart: CartItem[] = parts.map((product) => ({
      product,
      quantity: 1,
      serialNumbers: [''],
      showSerialInput: false,
    }));
    setExternalCart(nextCart);
    setActiveTab('pos');
  };

  const activeStoreName =
    stores.find((s) => s.id === storeId)?.name || 'MegaHertz Depot — Flagship';
  const currentStoreRole = stores.find((s) => s.id === storeId)?.role || 'owner';
  const isOwner = currentStoreRole === 'owner';

  // If not accessing staff routes, render public consumer storefront or product detail page
  if (!isStaffMode) {
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
                  const currentCart = raw ? JSON.parse(raw) : [];
                  const updated = [...currentCart];
                  for (const p of parts) {
                    const idx = updated.findIndex((i: any) => i.product.id === p.id);
                    if (idx >= 0) updated[idx].quantity += 1;
                    else updated.push({ product: p, quantity: 1 });
                  }
                  localStorage.setItem('megahertz_customer_cart', JSON.stringify(updated));
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
          onSwitchToStaff={navigateToStaff}
          onSelectProduct={navigateToProduct}
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
                const currentCart = raw ? JSON.parse(raw) : [];
                const updated = [...currentCart];
                for (const p of parts) {
                  const idx = updated.findIndex((i: any) => i.product.id === p.id);
                  if (idx >= 0) updated[idx].quantity += 1;
                  else updated.push({ product: p, quantity: 1 });
                }
                localStorage.setItem('megahertz_customer_cart', JSON.stringify(updated));
                setIsCustomerBuilderOpen(false);
              }}
            />
          </div>
        </ModalDialog>

        <ReloadPrompt />
      </>
    );
  }

  // Staff Portal authentication gate
  if (!token || !user) {
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

  return (
    <div className="min-h-screen flex flex-col bg-stone-950 text-stone-100 selection:bg-amber-500 selection:text-stone-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-stone-900/90 backdrop-blur-md border-b border-stone-800 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MegaHertzLogo variant="horizontal" size="md" showSubtitle={false} />
            <div className="hidden lg:flex items-center gap-2 border-l border-stone-800 pl-3">
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-stone-950 text-amber-400 border border-amber-500/30 font-semibold tracking-wider">
                Offline Hardware POS
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

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={navigateToStorefront}
              title="View Public Customer Storefront"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-xs text-stone-300 hover:text-white hover:bg-stone-800 transition"
            >
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">View Storefront</span>
            </button>

            <SyncStatusIndicator
              isOnline={isOnline}
              status={syncStatus}
              pendingCount={pendingOutboxCount}
              rejectedCount={rejectedOutboxCount}
              onManualSync={triggerSync}
              onOpenSyncScreen={() => setActiveTab('sync')}
            />
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

      {/* Sub-navigation Tabs */}
      <div className="border-b border-stone-800 bg-stone-950/80 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 overflow-x-auto py-2">
          <nav className="flex items-center gap-1.5" aria-label="Main navigation">
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              data-testid="tab-pos"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'pos'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                  : 'text-stone-400 hover:text-white hover:bg-stone-900'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>POS Register</span>
              {externalCart.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-stone-950/80 text-amber-300 text-[10px] font-mono">
                  {externalCart.reduce((acc, i) => acc + i.quantity, 0)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('builder')}
              data-testid="tab-builder"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'builder'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                  : 'text-stone-400 hover:text-white hover:bg-stone-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>PC Rig Builder</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              data-testid="tab-sales"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'sales'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                  : 'text-stone-400 hover:text-white hover:bg-stone-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Sales & Warranty ({orderCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              data-testid="tab-inventory"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'inventory'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                  : 'text-stone-400 hover:text-white hover:bg-stone-900'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Hardware Inventory ({activeProductCount})</span>
            </button>

            {isOwner && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                data-testid="tab-admin"
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  activeTab === 'admin'
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                    : 'text-amber-400 hover:text-white hover:bg-stone-900 border border-amber-500/20'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Admin Catalog</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('quick-count')}
              data-testid="tab-quick-count"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'quick-count'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                  : 'text-stone-400 hover:text-white hover:bg-stone-900'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Quick Count</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sync')}
              data-testid="tab-sync"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'sync'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                  : 'text-stone-400 hover:text-white hover:bg-stone-900'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync & Outbox</span>
              {pendingOutboxCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
                  {pendingOutboxCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              data-testid="tab-settings"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                activeTab === 'settings'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-950/40'
                  : 'text-stone-400 hover:text-white hover:bg-stone-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </nav>

          <div className="hidden xl:flex items-center gap-4 text-[11px] text-stone-400 shrink-0">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              Movements: <strong className="text-stone-200">{adjustmentCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
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

        {activeTab === 'pos' && (
          <PosRegisterPage
            storeId={storeId}
            storeName={activeStoreName}
            userId={user.id}
            lowStockThreshold={lowStockThreshold}
            currencySymbol={currencySymbol}
            externalCart={externalCart}
            setExternalCart={setExternalCart}
          />
        )}

        {activeTab === 'builder' && (
          <PcBuilderPage
            storeId={storeId}
            storeName={activeStoreName}
            currencySymbol={currencySymbol}
            onLoadBuildToCart={handleLoadBuildToCart}
          />
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

        {activeTab === 'admin' && (
          <AdminPage
            storeId={storeId}
            userId={user.id}
            userRole={currentStoreRole}
            token={token}
            currencySymbol={currencySymbol}
            lowStockThreshold={lowStockThreshold}
          />
        )}

        {activeTab === 'quick-count' && (
          <QuickCountPage storeId={storeId} userId={user.id} />
        )}

        {activeTab === 'sync' && (
          <SyncStatusPage
            storeId={storeId}
            isOnline={isOnline}
            status={syncStatus}
            onManualSync={triggerSync}
          />
        )}

        {activeTab === 'settings' && (
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
        )}
      </main>

      {/* Service Worker Update Prompt */}
      <ReloadPrompt />
    </div>
  );
}
