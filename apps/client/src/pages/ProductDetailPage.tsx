import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, SaleOrderLocal } from '../db/index.js';
import { ProductImage } from '../components/ProductImage.js';
import { MegaHertzLogo } from '../components/MegaHertzLogo.js';
import { CustomerAuthModal } from '../components/CustomerAuthModal.js';
import { CustomerCheckoutModal, StorefrontCartItem } from '../components/CustomerCheckoutModal.js';
import {
  computeDerivedStock,
  formatCurrency,
} from '@countwise/shared';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ShieldCheck,
  Zap,
  CheckCircle2,
  User,
  LogOut,
  X,
  ArrowRight,
  ArrowLeft,
  Package,
  Check,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';

interface CustomerUser {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  address?: string;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface ProductDetailPageProps {
  productId: string;
  storeId: string;
  currencySymbol?: string;
  onBack: () => void;
  onSelectProduct: (productId: string) => void;
  onOpenPcBuilder?: () => void;
}

export function ProductDetailPage({
  productId,
  storeId,
  currencySymbol = '₱',
  onBack,
  onSelectProduct,
}: ProductDetailPageProps) {
  const [quantity, setQuantity] = useState(1);
  const [search, setSearch] = useState('');

  // Customer state
  const [customer, setCustomer] = useState<CustomerUser | null>(() => {
    return safeJsonParse<CustomerUser | null>(localStorage.getItem('megahertz_customer_user'), null);
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Cart state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cart, setCart] = useState<StorefrontCartItem[]>(() => {
    return safeJsonParse<StorefrontCartItem[]>(localStorage.getItem('megahertz_customer_cart'), []);
  });

  // Checkout modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live query for all store products and current product
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

  const product = useMemo(() => {
    return products.find((p) => p.id === productId) || null;
  }, [products, productId]);

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const pAdjustments = adjustments.filter((a) => a.productId === p.id);
      map.set(p.id, computeDerivedStock(pAdjustments));
    }
    return map;
  }, [products, adjustments]);

  const currentStock = product ? stockMap.get(product.id) ?? 0 : 0;
  const isOutOfStock = currentStock <= 0;
  const isLowStock = currentStock > 0 && currentStock <= 3;

  // Related products from the same category
  const relatedProducts = useMemo(() => {
    if (!product) return [];
    return products
      .filter((p) => p.id !== product.id && p.category === product.category)
      .slice(0, 4);
  }, [products, product]);

  const updateCart = (newCart: StorefrontCartItem[]) => {
    setCart(newCart);
    localStorage.setItem('megahertz_customer_cart', JSON.stringify(newCart));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAddToCart = (qtyToAdd = quantity) => {
    if (!product) return;
    if (!customer) {
      setIsAuthOpen(true);
      return;
    }

    const existingIndex = cart.findIndex((item) => item.product.id === product.id);
    let newCart: StorefrontCartItem[];

    if (existingIndex >= 0) {
      newCart = cart.map((item, idx) =>
        idx === existingIndex ? { ...item, quantity: item.quantity + qtyToAdd } : item
      );
    } else {
      newCart = [...cart, { product, quantity: qtyToAdd }];
    }

    updateCart(newCart);
    showToast(`Added ${qtyToAdd}x "${product.name}" to cart!`);
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (!customer) {
      setIsAuthOpen(true);
      return;
    }

    handleAddToCart(quantity);
    setIsCheckoutOpen(true);
  };

  const handleUpdateQuantity = (prodId: string, delta: number) => {
    const newCart = cart
      .map((item) => {
        if (item.product.id === prodId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      })
      .filter((item): item is StorefrontCartItem => item !== null);

    updateCart(newCart);
  };

  const handleRemoveFromCart = (prodId: string) => {
    const newCart = cart.filter((item) => item.product.id !== prodId);
    updateCart(newCart);
  };

  const handleCustomerLogout = () => {
    localStorage.removeItem('megahertz_customer_user');
    localStorage.removeItem('megahertz_customer_token');
    setCustomer(null);
    showToast('Signed out of customer account.');
  };

  const handleOrderPlaced = (_order: SaleOrderLocal) => {
    updateCart([]);
    setIsCartOpen(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      onBack();
    }
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartAmount = cart.reduce(
    (sum, item) => sum + (item.product.price || 0) * item.quantity,
    0
  );

  if (!product) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-6">
        <Package className="w-16 h-16 text-stone-600 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Product Not Found</h2>
        <p className="text-xs text-stone-400 max-w-md text-center mb-6">
          The requested hardware item could not be found or may have been archived.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Catalog</span>
        </button>
      </div>
    );
  }

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
          {/* Logo (clickable to return home) */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={onBack}>
            <MegaHertzLogo variant="horizontal" size="md" showSubtitle={false} />
          </div>

          {/* Quick Search */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Search RTX 4070, Ryzen 7, DDR5, SSD..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
            />
          </form>

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
      </header>

      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8 flex-1">
        {/* Breadcrumb Navigation & Back Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-400 border-b border-stone-800/80 pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-stone-400 hover:text-white transition font-medium cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-amber-400" />
              <span>Catalog</span>
            </button>
            <span>/</span>
            <span className="text-amber-400 font-semibold">{product.category}</span>
            <span>/</span>
            <span className="text-white font-medium truncate max-w-[240px] sm:max-w-md">
              {product.name}
            </span>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-300 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Parts</span>
          </button>
        </div>

        {/* 2-Column Hero Product View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: High-Res Image Showcase (Expands to fill entire height) */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="relative rounded-3xl bg-stone-900 border border-stone-800 p-4 sm:p-8 flex items-center justify-center overflow-hidden shadow-2xl flex-1 min-h-[460px] sm:min-h-[520px] lg:min-h-[560px]">
              <ProductImage
                imageUrl={product.imageUrl}
                name={product.name}
                category={product.category}
                className="w-full h-full min-h-[400px] sm:min-h-[480px] lg:min-h-[520px] rounded-2xl object-cover"
              />

              {/* Stock status badge */}
              <div className="absolute top-4 right-4">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold font-mono backdrop-blur-md ${
                    isOutOfStock
                      ? 'bg-rose-950/90 text-rose-300 border border-rose-800/80'
                      : isLowStock
                      ? 'bg-amber-950/90 text-amber-300 border border-amber-800/80'
                      : 'bg-stone-950/90 text-emerald-300 border border-emerald-800/60'
                  }`}
                >
                  {isOutOfStock
                    ? 'Out of Stock / Backorder'
                    : isLowStock
                    ? `Only ${currentStock} Left in Stock`
                    : `In Stock (${currentStock} units)`}
                </span>
              </div>

              {/* Category indicator badge */}
              <div className="absolute bottom-4 left-4">
                <span className="px-3 py-1 rounded-xl text-xs font-bold bg-stone-950/90 text-amber-400 border border-amber-800/50 backdrop-blur-md">
                  {product.category}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Title, Specs Summary, Pricing & Actions */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-stone-400">
                <span className="text-amber-400 font-bold uppercase">{product.category}</span>
                {product.brand && <span>• {product.brand}</span>}
                {product.sku && <span>• SKU: {product.sku}</span>}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                {product.name}
              </h1>

              {product.warranty && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-stone-900 text-stone-400 text-xs border border-stone-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>{product.warranty} Official Partner Warranty</span>
                </div>
              )}
            </div>

            {/* Price Showcase */}
            <div className="p-5 rounded-2xl bg-stone-900 border border-stone-800 space-y-1">
              <div className="text-xs text-stone-400">Retail Unit Price (VAT Inclusive)</div>
              <div className="text-3xl sm:text-4xl font-black text-amber-400 font-mono tracking-tight">
                {formatCurrency(product.price ?? 0, currencySymbol)}
              </div>
            </div>

            {/* Quick Specs Highlight Pills */}
            {product.specs && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                  Hardware Specifications
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {product.specs.socket && (
                    <div className="p-3 rounded-xl bg-stone-900/70 border border-stone-800 text-xs">
                      <div className="text-[10px] text-stone-500 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-amber-400" />
                        Socket Platform
                      </div>
                      <div className="font-mono font-bold text-white mt-0.5">
                        {product.specs.socket}
                      </div>
                    </div>
                  )}

                  {product.specs.ramType && (
                    <div className="p-3 rounded-xl bg-stone-900/70 border border-stone-800 text-xs">
                      <div className="text-[10px] text-stone-500 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-amber-400" />
                        Memory Generation
                      </div>
                      <div className="font-mono font-bold text-white mt-0.5">
                        {product.specs.ramType}
                      </div>
                    </div>
                  )}

                  {product.specs.wattage ? (
                    <div className="p-3 rounded-xl bg-stone-900/70 border border-stone-800 text-xs">
                      <div className="text-[10px] text-stone-500 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        TDP / Power Draw
                      </div>
                      <div className="font-mono font-bold text-white mt-0.5">
                        {product.specs.wattage} Watts
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Purchase & Quantity Actions */}
            <div className="p-5 rounded-2xl bg-stone-900 border border-stone-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-stone-300">Quantity</div>
                <div className="flex items-center gap-2 bg-stone-950 border border-stone-800 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-sm font-bold text-white px-3">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-white cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleAddToCart(quantity)}
                  className="py-3 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 active:scale-95 border border-stone-700 text-stone-100 font-bold text-xs inline-flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4 text-amber-400" />
                  <span>Add to Shopping Cart</span>
                </button>

                <button
                  type="button"
                  onClick={handleBuyNow}
                  className="py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 font-bold text-xs inline-flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition cursor-pointer"
                >
                  <span>Buy Now & Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-800/80">
                <span className="flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Real-time stock verified
                </span>
                <span>In-Store Pickup or Express Courier</span>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Specifications Matrix */}
        <section className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Full Technical Specifications Sheet</span>
            </h3>
            <span className="text-xs font-mono text-stone-500">ID: {product.id}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-stone-800/60">
              <span className="text-stone-400">Category</span>
              <span className="font-semibold text-white">{product.category}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-stone-800/60">
              <span className="text-stone-400">Manufacturer / Brand</span>
              <span className="font-semibold text-white">{product.brand || 'Original Distro'}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-stone-800/60">
              <span className="text-stone-400">Stock Keeping Unit (SKU)</span>
              <span className="font-mono text-stone-300">{product.sku || 'N/A'}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-stone-800/60">
              <span className="text-stone-400">Warranty Coverage</span>
              <span className="font-semibold text-white">{product.warranty || '1 Year Store Warranty'}</span>
            </div>

            {product.specs?.socket && (
              <div className="flex justify-between py-2 border-b border-stone-800/60">
                <span className="text-stone-400">CPU Socket Standard</span>
                <span className="font-mono font-bold text-amber-400">{product.specs.socket}</span>
              </div>
            )}

            {product.specs?.ramType && (
              <div className="flex justify-between py-2 border-b border-stone-800/60">
                <span className="text-stone-400">RAM Generation Supported</span>
                <span className="font-mono font-bold text-amber-400">{product.specs.ramType}</span>
              </div>
            )}

            {product.specs?.wattage ? (
              <div className="flex justify-between py-2 border-b border-stone-800/60">
                <span className="text-stone-400">Thermal / Power Consumption (TDP)</span>
                <span className="font-mono font-bold text-white">{product.specs.wattage} Watts</span>
              </div>
            ) : null}

            <div className="flex justify-between py-2 border-b border-stone-800/60">
              <span className="text-stone-400">Available Gilmore Stock</span>
              <span className="font-mono font-bold text-stone-200">{currentStock} Units</span>
            </div>
          </div>
        </section>

        {/* Related & Compatible Components Carousel / Grid */}
        {relatedProducts.length > 0 && (
          <section className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                <span>Related {product.category} Components</span>
              </h3>
              <span className="text-xs text-stone-400">Browse more hardware</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.map((rel) => {
                const relStock = stockMap.get(rel.id) ?? 0;
                return (
                  <div
                    key={rel.id}
                    onClick={() => onSelectProduct(rel.id)}
                    className="p-4 rounded-2xl bg-stone-900 border border-stone-800 hover:border-amber-500/40 transition flex flex-col justify-between group cursor-pointer"
                  >
                    <div className="space-y-2">
                      <div className="overflow-hidden rounded-xl bg-stone-950 flex items-center justify-center">
                        <ProductImage
                          imageUrl={rel.imageUrl}
                          name={rel.name}
                          category={rel.category}
                          className="w-full h-36 rounded-xl group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="text-[10px] text-amber-400 font-medium">
                        {rel.category} {rel.brand && `• ${rel.brand}`}
                      </div>
                      <h4 className="font-bold text-white text-xs line-clamp-2 leading-snug group-hover:text-amber-300 transition-colors">
                        {rel.name}
                      </h4>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-stone-800 flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {formatCurrency(rel.price ?? 0, currencySymbol)}
                      </span>
                      <span className="text-[10px] text-stone-500">
                        {relStock > 0 ? `${relStock} in stock` : 'Backorder'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
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
        onSuccess={(user) => {
          setCustomer(user);
          setIsAuthOpen(false);
          showToast(`Welcome back, ${user.name || user.email}!`);
        }}
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

      {/* Footer */}
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
              Official partner warranties apply. In-store testing available.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
