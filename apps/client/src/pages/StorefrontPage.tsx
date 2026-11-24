import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AdjustmentLocal, localDb, ProductLocal, SaleOrderLocal } from '../db/index.js';
import { ProductImage } from '../components/ProductImage.js';
import { MegaHertzLogo } from '../components/MegaHertzLogo.js';
import { CustomerAuthModal } from '../components/CustomerAuthModal.js';
import { CustomerCheckoutModal, StorefrontCartItem } from '../components/CustomerCheckoutModal.js';
import {
  resolveEffectiveStock,
  decrementCachedPublicStock,
} from '../services/publicCatalogSync.js';
import {
  HardwareCategory,
  HARDWARE_CATEGORIES,
  formatCurrency,
} from '@countwise/shared';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  ShieldCheck,
  Zap,
  Truck,
  Store,
  CheckCircle2,
  User,
  LogOut,
  X,
  ArrowRight,
  Wrench,
  Cpu,
  Layers,
  HardDrive,
  Package,
  Server,
  Box,
  Fan,
  Monitor,
  MousePointer,
  Laptop,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface CustomerUser {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  address?: string;
}

interface StorefrontPageProps {
  storeId: string;
  currencySymbol?: string;
  onOpenPcBuilder?: () => void;
  onSwitchToStaff?: () => void;
  onSelectProduct?: (productId: string) => void;
  onResolvePublicStoreId?: (resolvedStoreId: string) => void;
}

const CATEGORY_ICONS: Record<HardwareCategory, React.ComponentType<{ className?: string }>> = {
  CPU: Cpu,
  Motherboard: Server,
  GPU: Sparkles,
  RAM: Layers,
  Storage: HardDrive,
  PSU: Zap,
  Case: Box,
  Cooling: Fan,
  Monitor: Monitor,
  Peripheral: MousePointer,
  Laptop: Laptop,
};

const COMPATIBILITY_TAGS = ['AM5', 'AM4', 'LGA1700', 'LGA1851', 'DDR5', 'DDR4'] as const;

export function StorefrontPage({
  storeId,
  currencySymbol = '₱',
  onOpenPcBuilder,
  onSelectProduct,
}: StorefrontPageProps) {
  // Search & Sidebar Filter State
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HardwareCategory | 'All'>('All');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedCompatTag, setSelectedCompatTag] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'name'>('featured');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Customer Authentication State
  const [customer, setCustomer] = useState<CustomerUser | null>(() =>
    safeJsonParse<CustomerUser | null>(localStorage.getItem('megahertz_customer_user'), null)
  );
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [pendingCartActionProduct, setPendingCartActionProduct] = useState<ProductLocal | null>(null);

  // Cart Drawer State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cart, setCart] = useState<StorefrontCartItem[]>(() =>
    safeJsonParse<StorefrontCartItem[]>(localStorage.getItem('megahertz_customer_cart'), [])
  );

  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Toast Feedback State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleExternalCartUpdate = () => {
      const raw = localStorage.getItem('megahertz_customer_cart');
      if (raw) {
        const parsedCart = safeJsonParse<StorefrontCartItem[] | null>(raw, null);
        if (parsedCart) {
          setCart(parsedCart);
          setIsCartOpen(true);
          setToastMessage('Added Custom PC Rig to Cart!');
          setTimeout(() => setToastMessage(null), 3000);
        }
      }
    };
    window.addEventListener('megahertz-cart-updated', handleExternalCartUpdate);
    return () => window.removeEventListener('megahertz-cart-updated', handleExternalCartUpdate);
  }, []);

  // Live queries from Dexie
  const products = useLiveQuery(
    () =>
      localDb.products
        .where('storeId')
        .equals(storeId)
        .filter((p) => !p.deletedAt)
        .toArray(),
    [storeId],
    []
  );

  const adjustments = useLiveQuery(
    () => localDb.adjustments.where('storeId').equals(storeId).toArray(),
    [storeId],
    []
  );

  // Stock computation map
  const stockMap = useMemo(() => {
    const adjustmentsByProduct = new Map<string, AdjustmentLocal[]>();
    for (const adj of adjustments) {
      const list = adjustmentsByProduct.get(adj.productId);
      if (list) list.push(adj);
      else adjustmentsByProduct.set(adj.productId, [adj]);
    }
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.id, resolveEffectiveStock(p, adjustmentsByProduct.get(p.id) ?? []));
    }
    return map;
  }, [products, adjustments]);

  // Available brands derived from catalog
  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const p of products) {
      if (p.brand && p.brand.trim()) {
        brands.add(p.brand.trim());
      }
    }
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // Filtered & sorted catalog
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (selectedCategory !== 'All' && p.category !== selectedCategory) {
          return false;
        }
        if (inStockOnly && (stockMap.get(p.id) ?? 0) <= 0) {
          return false;
        }
        if (selectedBrand && (p.brand || '').toLowerCase() !== selectedBrand.toLowerCase()) {
          return false;
        }
        if (selectedCompatTag) {
          const tagUpper = selectedCompatTag.toUpperCase();
          const socketMatch = p.specs?.socket?.toUpperCase() === tagUpper;
          const ramMatch = p.specs?.ramType?.toUpperCase() === tagUpper;
          if (!socketMatch && !ramMatch) {
            return false;
          }
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
          const matchBrand = p.brand ? p.brand.toLowerCase().includes(q) : false;
          if (!matchName && !matchSku && !matchBrand) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return (a.price ?? 0) - (b.price ?? 0);
        if (sortBy === 'price-desc') return (b.price ?? 0) - (a.price ?? 0);
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return 0; // 'featured' retains natural catalog order
      });
  }, [products, selectedCategory, inStockOnly, selectedBrand, selectedCompatTag, search, sortBy, stockMap]);

  const hasActiveFilters =
    selectedCategory !== 'All' ||
    inStockOnly ||
    Boolean(selectedBrand) ||
    Boolean(selectedCompatTag) ||
    Boolean(search.trim());

  const resetAllFilters = () => {
    setSelectedCategory('All');
    setSelectedBrand(null);
    setSelectedCompatTag(null);
    setInStockOnly(false);
    setSearch('');
  };

  // Persist cart to localStorage
  const updateCart = (newCart: StorefrontCartItem[]) => {
    setCart(newCart);
    localStorage.setItem('megahertz_customer_cart', JSON.stringify(newCart));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Add to cart with mandatory customer login check
  const handleAddToCart = (product: ProductLocal) => {
    if (!customer) {
      setPendingCartActionProduct(product);
      setIsAuthOpen(true);
      return;
    }

    const existingIndex = cart.findIndex((item) => item.product.id === product.id);
    let newCart: StorefrontCartItem[];

    if (existingIndex >= 0) {
      newCart = cart.map((item, idx) =>
        idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
      );
    } else {
      newCart = [...cart, { product, quantity: 1 }];
    }

    updateCart(newCart);
    showToast(`Added "${product.name}" to cart!`);
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    const newCart = cart
      .map((item) => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      })
      .filter((item): item is StorefrontCartItem => item !== null);

    updateCart(newCart);
  };

  const handleRemoveFromCart = (productId: string) => {
    const newCart = cart.filter((item) => item.product.id !== productId);
    updateCart(newCart);
  };

  const handleCustomerAuthSuccess = (user: CustomerUser, _token: string) => {
    setCustomer(user);
    showToast(`Welcome back, ${user.name || user.email}!`);

    if (pendingCartActionProduct) {
      const product = pendingCartActionProduct;
      setPendingCartActionProduct(null);
      const existingIndex = cart.findIndex((item) => item.product.id === product.id);
      let newCart: StorefrontCartItem[];
      if (existingIndex >= 0) {
        newCart = cart.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        newCart = [...cart, { product, quantity: 1 }];
      }
      updateCart(newCart);
      showToast(`Added "${product.name}" to cart!`);
    }
  };

  const handleCustomerLogout = () => {
    setCustomer(null);
    localStorage.removeItem('megahertz_customer_user');
    localStorage.removeItem('megahertz_customer_token');
    showToast('Signed out of customer account.');
  };

  const handleOrderPlaced = (order: SaleOrderLocal) => {
    updateCart([]);
    setIsCartOpen(false);
    void decrementCachedPublicStock(order.items);
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartAmount = cart.reduce(
    (sum, item) => sum + (item.product.price || 0) * item.quantity,
    0
  );

  // Reusable Catalog Left Sidebar Content
  const renderCatalogSidebar = () => (
    <div className="space-y-5">
      {/* 1. Hardware Categories Vertical Navigation */}
      <div className="p-4 rounded-2xl bg-stone-900/70 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-amber-400" />
            <span>Categories</span>
          </h3>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        <nav className="space-y-1" aria-label="Hardware categories">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                : 'text-stone-300 hover:text-white hover:bg-stone-800/80'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span>All PC Hardware</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                selectedCategory === 'All'
                  ? 'bg-stone-950/20 text-stone-950 font-bold'
                  : 'bg-stone-950 text-stone-400'
              }`}
            >
              {products.length}
            </span>
          </button>

          {HARDWARE_CATEGORIES.map((cat) => {
            const count = products.filter((p) => p.category === cat).length;
            const Icon = CATEGORY_ICONS[cat] || Package;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800/80'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-stone-950' : 'text-amber-400/80'
                    }`}
                  />
                  <span className="truncate">{cat}</span>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono shrink-0 ${
                    isSelected
                      ? 'bg-stone-950/20 text-stone-950 font-bold'
                      : 'bg-stone-950 text-stone-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* 2. Availability & Compatibility Quick-Filters */}
      <div className="p-4 rounded-2xl bg-stone-900/70 border border-stone-800 space-y-4">
        {/* In-Stock Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-stone-200">In-Stock Only</div>
            <div className="text-[10px] text-stone-500">Hide backorder items</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={inStockOnly}
            onClick={() => setInStockOnly((v) => !v)}
            className={`w-10 h-5.5 rounded-full p-0.5 transition-colors cursor-pointer ${
              inStockOnly ? 'bg-amber-500' : 'bg-stone-800 border border-stone-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full transition-transform ${
                inStockOnly ? 'translate-x-4.5 bg-stone-950' : 'translate-x-0 bg-stone-400'
              }`}
            />
          </button>
        </div>

        {/* Socket & RAM Compatibility Quick-Filters */}
        <div className="pt-3 border-t border-stone-800 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
            Platform & Memory Specs
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {COMPATIBILITY_TAGS.map((tag) => {
              const active = selectedCompatTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedCompatTag(active ? null : tag)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold border transition cursor-pointer ${
                    active
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white hover:border-stone-700'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Brand Filter Pills */}
        {availableBrands.length > 0 && (
          <div className="pt-3 border-t border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                Filter by Brand ({availableBrands.length})
              </div>
              {selectedBrand && (
                <button
                  type="button"
                  onClick={() => setSelectedBrand(null)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
              {availableBrands.map((brand) => {
                const active = selectedBrand === brand;
                return (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => setSelectedBrand(active ? null : brand)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-stone-950 border-amber-500 font-bold'
                        : 'bg-stone-950 border-stone-800 text-stone-300 hover:border-stone-700 hover:text-white'
                    }`}
                  >
                    {brand}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Custom PC Rig Builder Promo Card */}
      {onOpenPcBuilder && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-stone-900 via-stone-900 to-amber-950/30 border border-amber-500/30 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Wrench className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-white">Custom PC Rig Builder</h4>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Automatic AM5 / LGA1700 socket &amp; PSU wattage compatibility checker.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenPcBuilder}
            className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 transition cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Launch Rig Builder</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-amber-500 selection:text-stone-950">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-stone-900 text-amber-200 border border-amber-500/40 shadow-2xl backdrop-blur-md text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Consumer Navbar */}
      <header className="sticky top-0 z-40 bg-stone-950/95 border-b border-stone-800/80 backdrop-blur-md px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Slogan */}
          <div className="flex items-center gap-3">
            <MegaHertzLogo variant="horizontal" size="md" showSubtitle={false} />
          </div>

          {/* Quick Search */}
          <div className="hidden md:flex relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Search RTX 4070, Ryzen 7, DDR5, SSD..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* User Account & Cart Button */}
          <div className="flex items-center gap-3">
            {customer ? (
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-300">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold truncate max-w-[120px]">
                    {customer.name || customer.email.split('@')[0]}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCustomerLogout}
                  title="Sign out"
                  className="p-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-white transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-semibold text-stone-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Login</span>
              </button>
            )}

            {/* Cart Button */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-950/40 transition cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Cart</span>
              {totalCartCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-stone-950 text-amber-400 font-mono text-[10px]">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Search Input */}
        <div className="md:hidden mt-2.5 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            placeholder="Search PC hardware..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </header>

      {/* Minimalist Centered Hero (NZXT / Framework Style) */}
      <section className="relative overflow-hidden border-b border-stone-800/80 bg-stone-950 py-14 sm:py-20 px-4 sm:px-8">
        {/* Subtle centered ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[260px] bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center space-y-5 relative z-10">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.08]">
            Unleash Maximum Clock Speeds with{' '}
            <span className="text-amber-400 font-black">
              Flagship PC Hardware
            </span>
          </h1>

          <p className="text-sm sm:text-base text-stone-400 leading-relaxed max-w-2xl mx-auto">
            Browse top-tier processors, graphics cards, motherboards, high-speed DDR5 memory, and
            custom gaming rigs. In-store pickup in Quezon City or fast door-to-door delivery.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3.5 pt-3">
            <a
              href="#catalog"
              className="px-7 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-950/40 transition transform active:scale-95 inline-flex items-center gap-2"
            >
              <span>Shop Components</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            {onOpenPcBuilder && (
              <button
                type="button"
                onClick={onOpenPcBuilder}
                className="px-7 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 text-stone-100 font-bold text-xs sm:text-sm transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Wrench className="w-4 h-4 text-amber-400" />
                <span>Launch PC Rig Builder</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Catalog Section with Sticky Left Filter Sidebar */}
      <main id="catalog" className="max-w-7xl w-full mx-auto p-4 sm:p-8 flex-1 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr] gap-6 items-start">
          {/* Desktop Sticky Left Filter Sidebar */}
          <aside className="hidden lg:block sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1.5 overscroll-contain">
            {renderCatalogSidebar()}
          </aside>

          {/* Right Column: Filter Bar + Product Grid */}
          <div className="space-y-5 min-w-0">
            {/* Sort & Active Filter Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-stone-900/60 p-3.5 rounded-2xl border border-stone-800">
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400 font-medium">
                {/* Mobile Filter Drawer Trigger */}
                <button
                  type="button"
                  onClick={() => setIsMobileFiltersOpen((v) => !v)}
                  className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-200 font-semibold text-xs cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  <span>Categories &amp; Filters</span>
                </button>

                <span>
                  Showing <strong className="text-white">{filteredProducts.length}</strong> of{' '}
                  {products.length} components
                </span>

                {selectedCategory !== 'All' && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold inline-flex items-center gap-1">
                    {selectedCategory}
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('All')}
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {selectedBrand && (
                  <span className="px-2 py-0.5 rounded-lg bg-stone-800 border border-stone-700 text-stone-200 font-semibold inline-flex items-center gap-1">
                    {selectedBrand}
                    <button
                      type="button"
                      onClick={() => setSelectedBrand(null)}
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {selectedCompatTag && (
                  <span className="px-2 py-0.5 rounded-lg bg-stone-800 border border-stone-700 text-amber-300 font-mono font-semibold inline-flex items-center gap-1">
                    {selectedCompatTag}
                    <button
                      type="button"
                      onClick={() => setSelectedCompatTag(null)}
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <span className="text-xs text-stone-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="featured">Featured First</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name">Product Name (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Collapsible Mobile Filter Panel (< lg) */}
            {isMobileFiltersOpen && (
              <div className="lg:hidden">
                {renderCatalogSidebar()}
              </div>
            )}

            {/* Product Cards Grid */}
            {filteredProducts.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-stone-900/40 border border-stone-800 space-y-3">
                <Package className="w-12 h-12 text-stone-600 mx-auto" />
                <h3 className="text-base font-semibold text-stone-300">
                  No components match your filter
                </h3>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Try resetting your category, brand, or compatibility filters to browse the full
                  MegaHertz hardware catalog.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 bg-amber-500 text-stone-950 font-bold rounded-xl text-xs hover:bg-amber-400 transition cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProducts.map((product) => {
                  const stock = stockMap.get(product.id) ?? 0;
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock <= 3;

                  return (
                    <div
                      key={product.id}
                      onClick={() => onSelectProduct?.(product.id)}
                      className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4 flex flex-col justify-between hover:border-amber-500/40 hover:shadow-xl hover:shadow-stone-950/40 transition-all group cursor-pointer"
                    >
                      <div className="space-y-3">
                        {/* Picture / Dynamic Placeholder */}
                        <div className="relative overflow-hidden rounded-xl bg-stone-950 flex items-center justify-center">
                          <ProductImage
                            imageUrl={product.imageUrl}
                            sku={product.sku}
                            name={product.name}
                            category={product.category}
                            className="w-full h-44 rounded-xl group-hover:scale-105 transition-transform duration-300"
                          />

                          {/* Stock badge */}
                          <div className="absolute top-2 right-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono backdrop-blur-md ${
                                isOutOfStock
                                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                                  : isLowStock
                                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                                  : 'bg-stone-950/90 text-stone-300 border border-stone-700/60'
                              }`}
                            >
                              {isOutOfStock
                                ? 'Backorder'
                                : isLowStock
                                ? `Only ${stock} Left`
                                : 'In Stock'}
                            </span>
                          </div>
                        </div>

                        {/* Metadata & Title */}
                        <div>
                          <div className="flex items-center gap-1.5 text-[10px] text-stone-400 font-medium">
                            <span className="text-amber-400">{product.category}</span>
                            {product.brand && <span>• {product.brand}</span>}
                          </div>

                          <h3 className="font-bold text-white text-sm line-clamp-2 mt-1 leading-snug group-hover:text-amber-300 transition-colors">
                            {product.name}
                          </h3>

                          {/* Specs Chips */}
                          {product.specs && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {product.specs.socket && (
                                <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-[10px] font-mono border border-stone-700/60">
                                  {product.specs.socket}
                                </span>
                              )}
                              {product.specs.ramType && (
                                <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-[10px] font-mono border border-stone-700/60">
                                  {product.specs.ramType}
                                </span>
                              )}
                              {product.specs.formFactor && (
                                <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-[10px] font-mono border border-stone-700/60">
                                  {product.specs.formFactor}
                                </span>
                              )}
                              {product.specs.wattage ? (
                                <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-[10px] font-mono border border-stone-700/60">
                                  {product.specs.wattage}W
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Price & Add to Cart Action */}
                      <div className="mt-4 pt-3 border-t border-stone-800 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-base font-extrabold text-amber-400 font-mono">
                            {formatCurrency(product.price ?? 0, currencySymbol)}
                          </div>
                          {product.warranty && (
                            <div className="text-[10px] text-stone-500 truncate max-w-[110px]">
                              {product.warranty}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToCart(product);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-md shadow-amber-950/30 transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add to Cart</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Trust & Guarantee Banner */}
        <section className="mt-8 p-6 sm:p-8 rounded-3xl bg-stone-900/60 border border-stone-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-stone-800/80 border border-stone-700 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">1-Year Store Warranty</h4>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Full supplier warranty and 7-day replacement guarantee on all hardware.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-stone-800/80 border border-stone-700 text-amber-400 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Gilmore Flagship Branch</h4>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Ready for in-store pickup with physical diagnostic testing and benchmarking.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-stone-800/80 border border-stone-700 text-amber-400 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Nationwide Shipping</h4>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Insured express delivery with bubblewrap protection and tracking updates.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-stone-800/80 border border-stone-700 text-amber-400 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Genuine &amp; Sealed</h4>
              <p className="text-[11px] text-stone-400 mt-0.5">
                100% brand new authentic parts from official Philippine distributors.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Slide-out Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-stone-950/75 backdrop-blur-sm transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-stone-900 border-l border-stone-800 p-6 flex flex-col justify-between shadow-2xl">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-stone-800">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white">Your Shopping Cart</h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-stone-950 text-amber-300 border border-amber-800/60">
                      {totalCartCount}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCartOpen(false)}
                    className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="divide-y divide-stone-800/80 max-h-[60vh] overflow-y-auto mt-4 pr-1">
                  {cart.length === 0 ? (
                    <div className="py-12 text-center text-stone-400 space-y-2">
                      <ShoppingCart className="w-10 h-10 text-stone-600 mx-auto" />
                      <p className="text-sm font-semibold text-stone-300">Your cart is empty</p>
                      <p className="text-xs text-stone-500">
                        Add PC hardware components to start your order.
                      </p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.product.id} className="py-3 flex items-center gap-3">
                        <ProductImage
                          imageUrl={item.product.imageUrl}
                          sku={item.product.sku}
                          name={item.product.name}
                          category={item.product.category}
                          className="w-12 h-12 rounded-xl shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">
                            {item.product.name}
                          </h4>
                          <div className="text-xs font-extrabold text-amber-400 font-mono mt-0.5">
                            {formatCurrency(
                              (item.product.price || 0) * item.quantity,
                              currencySymbol
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-lg p-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, -1)}
                            className="p-1 rounded text-stone-400 hover:text-white cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-xs font-bold text-white px-1">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, 1)}
                            className="p-1 rounded text-stone-400 hover:text-white cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.product.id)}
                          className="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {cart.length > 0 && (
                <div className="pt-4 border-t border-stone-800 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-stone-400">Order Subtotal</span>
                    <span className="text-xl font-extrabold text-amber-400 font-mono">
                      {formatCurrency(totalCartAmount, currencySymbol)}
                    </span>
                  </div>

                  <p className="text-[11px] text-stone-500">
                    Taxes included. Fulfillment options (In-Store Pickup or Delivery) selected on
                    checkout.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (!customer) {
                        setIsAuthOpen(true);
                        return;
                      }
                      setIsCheckoutOpen(true);
                    }}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Auth Modal */}
      <CustomerAuthModal
        open={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleCustomerAuthSuccess}
      />

      {/* Customer Checkout Modal */}
      {customer && (
        <CustomerCheckoutModal
          open={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          storeId={storeId}
          customer={customer}
          cart={cart}
          onOrderPlaced={handleOrderPlaced}
          currencySymbol={currencySymbol}
        />
      )}

      {/* Clean Consumer Footer */}
      <footer className="border-t border-stone-800/80 bg-stone-950/90 py-8 px-4 sm:px-8 text-xs text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MegaHertzLogo variant="horizontal" size="sm" showSubtitle={false} />
            <div>
              <div className="text-stone-300 font-semibold">MegaHertz Depot Flagship Store</div>
              <p className="text-[11px] text-stone-500">Gilmore Tech Center, Quezon City, Metro Manila</p>
            </div>
          </div>

          <div className="text-center sm:text-right space-y-1">
            <p>© {new Date().getFullYear()} MegaHertz Depot. All rights reserved.</p>
            <p className="text-[10px] text-stone-600">
              Prices and stock levels update in real time. Official partner warranties apply.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
