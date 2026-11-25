import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal, SaleOrderLocal } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import { buildAdjustmentStockMap } from '../services/publicCatalogSync.js';
import { ReceiptQuoteModal } from '../components/ReceiptQuoteModal.js';
import { ProductImage } from '../components/ProductImage.js';
import {
  HARDWARE_CATEGORIES,
  HardwareCategory,
  PaymentMethod,
  formatCurrency,
} from '@countwise/shared';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Cpu,
  ShieldCheck,
  PackagePlus,
  CreditCard,
  Banknote,
  Smartphone,
  Barcode,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export interface CartItem {
  product: ProductLocal;
  quantity: number;
  serialNumbers: string[];
  showSerialInput?: boolean;
}

interface PosRegisterPageProps {
  storeId: string;
  storeName: string;
  userId: string;
  currencySymbol: string;
  lowStockThreshold: number;
  externalCart: CartItem[];
  setExternalCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
}

export function PosRegisterPage({
  storeId,
  storeName,
  userId,
  currencySymbol,
  lowStockThreshold,
  externalCart: cart,
  setExternalCart: setCart,
}: PosRegisterPageProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HardwareCategory | 'All'>('All');

  // Checkout state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountInput, setDiscountInput] = useState('0');
  const [taxRate] = useState(12); // 12% VAT
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [amountTenderedInput, setAmountTenderedInput] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<SaleOrderLocal | null>(null);
  const [seeding, setSeeding] = useState(false);

  // USB / Keyboard-Wedge Barcode Scanner State
  const [scannerMode, setScannerMode] = useState(true);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const scanBufferRef = useRef<{ chars: string; lastKeyTime: number }>({
    chars: '',
    lastKeyTime: 0,
  });

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

  const stockByProduct = useMemo(
    () => buildAdjustmentStockMap(products, adjustments),
    [products, adjustments]
  );

  const catalogItems = useMemo(() => {
    return products
      .map((p) => ({
        product: p,
        stock: stockByProduct.get(p.id) ?? 0,
      }))
      .filter(({ product }) => {
        if (selectedCategory !== 'All' && product.category !== selectedCategory) {
          return false;
        }
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          product.name.toLowerCase().includes(q) ||
          (product.sku && product.sku.toLowerCase().includes(q)) ||
          (product.brand && product.brand.toLowerCase().includes(q)) ||
          (product.specs?.socket && product.specs.socket.toLowerCase().includes(q)) ||
          (product.specs?.ramType && product.specs.ramType.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [products, stockByProduct, selectedCategory, search]);

  const handleSeedCatalog = async () => {
    setSeeding(true);
    try {
      await localRepository.seedSampleHardwareCatalog(storeId, userId);
    } finally {
      setSeeding(false);
    }
  };

  const addToCart = (product: ProductLocal) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => i.product.id === product.id);
      if (existingIdx > -1) {
        const updated = [...prev];
        const item = updated[existingIdx];
        updated[existingIdx] = {
          ...item,
          quantity: item.quantity + 1,
          serialNumbers: [...item.serialNumbers, ''],
        };
        return updated;
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          serialNumbers: [''],
          showSerialInput: false,
        },
      ];
    });
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          const nextSerials =
            nextQty > item.serialNumbers.length
              ? [...item.serialNumbers, ...Array(nextQty - item.serialNumbers.length).fill('')]
              : item.serialNumbers.slice(0, nextQty);
          return { ...item, quantity: nextQty, serialNumbers: nextSerials };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const toggleSerialInput = (productId: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, showSerialInput: !item.showSerialInput }
          : item
      )
    );
  };

  const updateSerialNumber = (productId: string, index: number, val: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const copy = [...item.serialNumbers];
        copy[index] = val;
        return { ...item, serialNumbers: copy };
      })
    );
  };

  // Totals & VAT Calculation
  const subtotal = useMemo(() => {
    return cart.reduce((sum, i) => sum + (i.product.price || 0) * i.quantity, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    const val = parseFloat(discountInput) || 0;
    if (val <= 0) return 0;
    if (discountType === 'percent') {
      return Math.min(subtotal, Math.round(subtotal * (Math.min(100, val) / 100) * 100) / 100);
    }
    return Math.min(subtotal, val);
  }, [subtotal, discountInput, discountType]);

  const netAfterDiscount = Math.max(0, subtotal - discountAmount);

  const taxAmount = useMemo(() => {
    if (taxInclusive) {
      return Math.round((netAfterDiscount - netAfterDiscount / (1 + taxRate / 100)) * 100) / 100;
    }
    return Math.round(netAfterDiscount * (taxRate / 100) * 100) / 100;
  }, [netAfterDiscount, taxInclusive, taxRate]);

  const totalAmount = taxInclusive ? netAfterDiscount : netAfterDiscount + taxAmount;

  const trimmedTendered = amountTenderedInput.trim();
  const hasTenderedInput = trimmedTendered !== '';
  const parsedTendered = hasTenderedInput ? Number(trimmedTendered) : NaN;
  const isTenderedValidNumber = Number.isFinite(parsedTendered) && parsedTendered >= 0;
  const totalCents = Math.round(totalAmount * 100);
  const tenderedCents = isTenderedValidNumber ? Math.round(parsedTendered * 100) : 0;

  const isTenderMissing = cart.length > 0 && totalCents > 0 && !hasTenderedInput;
  const isTenderInsufficient =
    cart.length > 0 &&
    totalCents > 0 &&
    hasTenderedInput &&
    (!isTenderedValidNumber || tenderedCents < totalCents);
  const shortfallAmount =
    isTenderInsufficient && isTenderedValidNumber
      ? Math.round((totalAmount - parsedTendered) * 100) / 100
      : totalAmount;
  const canCompleteSale =
    cart.length > 0 &&
    !isTenderMissing &&
    !isTenderInsufficient &&
    (totalCents === 0 || isTenderedValidNumber);

  const amountTendered =
    hasTenderedInput && isTenderedValidNumber ? Math.round(parsedTendered * 100) / 100 : 0;
  const changeDue =
    hasTenderedInput && isTenderedValidNumber && tenderedCents >= totalCents
      ? Math.round((parsedTendered - totalAmount) * 100) / 100
      : 0;

  const handleCompleteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    if (isTenderMissing) {
      setCheckoutError('Please enter the amount tendered before completing checkout.');
      return;
    }

    if (isTenderInsufficient || (totalCents > 0 && !isTenderedValidNumber)) {
      setCheckoutError(
        `Insufficient payment: short by ${formatCurrency(shortfallAmount, currencySymbol)}.`
      );
      return;
    }

    setCheckoutError(null);

    try {
      const order = await localRepository.createSaleOrder({
        storeId,
        userId,
        customerName,
        customerPhone,
        items: cart.map((c) => ({
          productId: c.product.id,
          productName: c.product.name,
          sku: c.product.sku ?? null,
          category: c.product.category ?? 'Peripheral',
          warranty: c.product.warranty ?? '1 Year Store Warranty',
          quantity: c.quantity,
          unitPrice: c.product.price ?? 0,
          serialNumbers: c.serialNumbers.map((s) => s.trim()).filter(Boolean),
        })),
        subtotal,
        discountAmount,
        taxRate,
        taxInclusive,
        taxAmount,
        totalAmount,
        paymentMethod,
        amountTendered,
        changeDue,
      });

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDiscountInput('0');
      setAmountTenderedInput('');
      setCompletedOrder(order);
    } catch (err: any) {
      setCheckoutError(err?.message || 'Unable to complete checkout.');
    }
  };

  // Barcode / Quick-SKU Ring-Up Handler
  const handleBarcodeRingUp = (rawCode: string): boolean => {
    const code = rawCode.trim().toLowerCase();
    if (!code) return false;

    const exactSkuMatch = products.find((p) => p.sku && p.sku.toLowerCase() === code);
    if (exactSkuMatch) {
      addToCart(exactSkuMatch);
      setScanFeedback({
        type: 'success',
        text: `Scanned [${exactSkuMatch.sku}]: added "${exactSkuMatch.name}"`,
      });
      setTimeout(() => setScanFeedback(null), 3000);
      return true;
    }

    const partialSkuMatch = products.filter(
      (p) =>
        (p.sku && p.sku.toLowerCase().includes(code)) ||
        p.name.toLowerCase().includes(code)
    );
    if (partialSkuMatch.length === 1) {
      const target = partialSkuMatch[0];
      addToCart(target);
      setScanFeedback({
        type: 'success',
        text: `Matched [${target.sku || target.name}]: added "${target.name}"`,
      });
      setTimeout(() => setScanFeedback(null), 3000);
      return true;
    }

    setScanFeedback({
      type: 'error',
      text:
        partialSkuMatch.length > 1
          ? `Multiple items match "${rawCode.trim()}" - select the item below`
          : `No hardware SKU found matching barcode "${rawCode.trim()}"`,
    });
    setTimeout(() => setScanFeedback(null), 3500);
    return false;
  };

  useEffect(() => {
    if (!scannerMode) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInputFocused) return;

      const now = Date.now();
      const elapsed = now - scanBufferRef.current.lastKeyTime;

      if (e.key === 'Enter') {
        if (scanBufferRef.current.chars.length >= 3 && elapsed < 150) {
          e.preventDefault();
          const scanned = scanBufferRef.current.chars;
          scanBufferRef.current.chars = '';
          handleBarcodeRingUp(scanned);
        } else {
          scanBufferRef.current.chars = '';
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (elapsed > 120) {
          scanBufferRef.current.chars = e.key;
        } else {
          scanBufferRef.current.chars += e.key;
        }
        scanBufferRef.current.lastKeyTime = now;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [scannerMode, products]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left 7 Columns: Hardware Catalog Grid */}
      <div className="lg:col-span-7 space-y-4">
        {/* Search, Barcode Scanner Toggle & Seed Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  e.preventDefault();
                  const added = handleBarcodeRingUp(search);
                  if (added) setSearch('');
                }
              }}
              placeholder="Scan barcode / SKU or search hardware (press Enter to quick-add)..."
              data-testid="pos-search-input"
              className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-3.5 pl-9 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setScannerMode((v) => !v)}
            title="Toggle USB / Keyboard-Wedge Barcode Scanner Listener"
            className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer shrink-0 ${
              scannerMode
                ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-300'
                : 'bg-white dark:bg-carbon border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
            }`}
          >
            <Barcode className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
            <span>{scannerMode ? 'Scanner Active' : 'Scanner Paused'}</span>
          </button>

          {products.length === 0 && (
            <button
              type="button"
              onClick={handleSeedCatalog}
              disabled={seeding}
              data-testid="seed-hardware-btn"
              className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
            >
              <PackagePlus className="w-4 h-4" strokeWidth={1.75} />
              <span>{seeding ? 'Seeding...' : 'Seed Sample Hardware'}</span>
            </button>
          )}
        </div>

        {/* Live Barcode Scan Feedback Banner */}
        {scanFeedback && (
          <div
            className={`px-3.5 py-2 rounded-md border text-xs font-medium flex items-center gap-2 ${
              scanFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            }`}
          >
            {scanFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" strokeWidth={1.75} />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" strokeWidth={1.75} />
            )}
            <span>{scanFeedback.text}</span>
          </div>
        )}

        {/* Hardware Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                : 'bg-white dark:bg-carbon text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            All Parts ({products.length})
          </button>
          {HARDWARE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                  : 'bg-white dark:bg-carbon text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Empty State or Product Catalog Grid */}
        {products.length === 0 ? (
          <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-md bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center mx-auto">
              <Cpu className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Load Branch PC Hardware Catalog
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Seed the sample PC hardware catalog to ring up sales, record serial numbers, and
                issue receipts offline.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSeedCatalog}
              disabled={seeding}
              data-testid="empty-seed-hardware-btn"
              className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <PackagePlus className="w-4 h-4" strokeWidth={1.75} />
              <span>Seed Sample PC Hardware Catalog</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[68vh] overflow-y-auto pr-1">
            {catalogItems.map(({ product, stock }) => {
              const isOutOfStock = stock <= 0;
              const isLow = stock > 0 && stock <= lowStockThreshold;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  data-testid={`pos-card-${product.sku || product.name}`}
                  className="text-left group bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-lg p-3.5 flex flex-col justify-between gap-3 cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <ProductImage
                      imageUrl={product.imageUrl}
                      sku={product.sku}
                      name={product.name}
                      category={product.category}
                      className="w-16 h-16 shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                          {product.sku || product.category}
                        </span>
                        <span
                          className={`text-[11px] font-medium px-1.5 py-0.5 rounded border tabular-nums shrink-0 ${
                            isOutOfStock
                              ? 'bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-300 border-red-200 dark:border-rose-800'
                              : isLow
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {stock} in stock
                        </span>
                      </div>

                      <h4 className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 line-clamp-2 leading-snug">
                        {product.name}
                      </h4>

                      <div className="flex items-center flex-wrap gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {product.brand && <span>{product.brand}</span>}
                        {product.specs?.socket && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-mono text-[10px]">
                            {product.specs.socket}
                          </span>
                        )}
                        {product.specs?.ramType && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-mono text-[10px]">
                            {product.specs.ramType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-zinc-100 dark:border-zinc-800">
                    <div>
                      <div className="text-sm font-bold text-zinc-950 dark:text-zinc-50 font-mono tabular-nums">
                        {formatCurrency(product.price || 0, currencySymbol)}
                      </div>
                      {product.warranty && (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                          <ShieldCheck
                            className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0"
                            strokeWidth={1.75}
                          />
                          <span className="truncate max-w-[140px]">{product.warranty}</span>
                        </div>
                      )}
                    </div>

                    <span className="w-8 h-8 rounded-md bg-zinc-100 dark:bg-carbon-elevated group-hover:bg-zinc-950 dark:group-hover:bg-zinc-100 text-zinc-700 dark:text-zinc-200 group-hover:text-white dark:group-hover:text-zinc-950 flex items-center justify-center transition-colors">
                      <Plus className="w-4 h-4" strokeWidth={1.75} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right 5 Columns: Active Register Cart & Checkout */}
      <div className="lg:col-span-5 bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 flex flex-col justify-between space-y-4 self-start sticky top-16">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-zinc-800 dark:text-zinc-200" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Register Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
            </h3>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-red-700 dark:hover:text-rose-400 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Cart Items List */}
        {cart.length === 0 ? (
          <div className="py-10 text-center space-y-2 text-zinc-500 dark:text-zinc-400">
            <ShoppingCart className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700" strokeWidth={1.75} />
            <p className="text-xs">
              Select any hardware component on the left to add it to this transaction.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {cart.map((item) => {
              const currentStock = stockByProduct.get(item.product.id) ?? 0;
              const willOversell = currentStock - item.quantity < 0;
              return (
                <div
                  key={item.product.id}
                  className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-950 dark:text-zinc-50 truncate">
                        {item.product.name}
                      </div>
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 tabular-nums">
                        {formatCurrency(item.product.price || 0, currencySymbol)} each |{' '}
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {item.product.warranty || '1 Yr Warranty'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-bold text-zinc-950 dark:text-zinc-50 font-mono tabular-nums shrink-0">
                      {formatCurrency((item.product.price || 0) * item.quantity, currencySymbol)}
                    </div>
                  </div>

                  {willOversell && (
                    <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" strokeWidth={1.75} />
                      <span>
                        Offline sale allowed: local stock ({currentStock}) will go negative and
                        flag a backorder check on sync.
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => toggleSerialInput(item.product.id)}
                      className="text-[11px] font-medium text-amber-800 dark:text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Barcode className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>
                        {item.showSerialInput
                          ? 'Hide Serial Numbers (S/N)'
                          : `Record S/N (${item.serialNumbers.filter(Boolean).length}/${item.quantity})`}
                      </span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.id, -1)}
                        aria-label={`Decrease ${item.product.name} quantity`}
                        className="w-7 h-7 rounded bg-white dark:bg-carbon hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-800 dark:text-zinc-200 cursor-pointer transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                      <span className="w-6 text-center font-bold font-mono tabular-nums text-zinc-950 dark:text-zinc-50">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.id, 1)}
                        aria-label={`Increase ${item.product.name} quantity`}
                        className="w-7 h-7 rounded bg-white dark:bg-carbon hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-800 dark:text-zinc-200 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>

                  {item.showSerialInput && (
                    <div className="space-y-1.5 pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                      {item.serialNumbers.map((sn, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={sn}
                          onChange={(e) =>
                            updateSerialNumber(item.product.id, idx, e.target.value)
                          }
                          placeholder={`Unit #${idx + 1} Serial Number (S/N) for Warranty`}
                          className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1 text-[11px] font-mono text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Checkout Payment & Customer Form */}
        <form onSubmit={handleCompleteSale} className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              aria-label="Customer Name (Optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer Name (Optional)"
              className="bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
            />
            <input
              type="text"
              aria-label="Phone or Contact"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone / Contact"
              className="bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
            />
          </div>

          {/* Discount & VAT Toggle Row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="pos-discount-input" className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Discount
                </label>
                <div className="flex rounded bg-zinc-100 dark:bg-carbon-elevated p-0.5 border border-zinc-200 dark:border-zinc-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2 py-0.5 rounded cursor-pointer font-semibold ${
                      discountType === 'fixed'
                        ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                    }`}
                  >
                    {currencySymbol}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-2 py-0.5 rounded cursor-pointer font-semibold ${
                      discountType === 'percent'
                        ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <input
                id="pos-discount-input"
                type="number"
                min={0}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950"
              />
            </div>

            <div>
              <span className="block text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">12% VAT Mode</span>
              <button
                type="button"
                onClick={() => setTaxInclusive((v) => !v)}
                className="w-full py-1.5 px-3 rounded bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 font-medium cursor-pointer transition-colors"
              >
                {taxInclusive ? '12% VAT Inclusive' : '12% VAT Exclusive (+12%)'}
              </button>
            </div>
          </div>

          {/* Payment Method Pills */}
          <div className="space-y-1">
            <span className="block text-[11px] text-zinc-600 dark:text-zinc-400">Payment Method</span>
            <div className="grid grid-cols-5 gap-1.5">
              {(['Cash', 'GCash', 'Maya', 'Card', 'Split'] as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 rounded-md text-[11px] font-semibold border flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                    paymentMethod === method
                      ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                      : 'bg-white dark:bg-carbon-elevated border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {method === 'Cash' ? (
                    <Banknote className="w-3.5 h-3.5" strokeWidth={1.75} />
                  ) : method === 'Card' ? (
                    <CreditCard className="w-3.5 h-3.5" strokeWidth={1.75} />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  <span>{method}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tendered Input */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400 mb-1">
              <label htmlFor="pos-tendered-input">Amount Tendered ({currencySymbol})</label>
              <span>
                Change Due:{' '}
                <strong className="text-amber-800 dark:text-amber-400 font-mono tabular-nums">
                  {formatCurrency(changeDue, currencySymbol)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="pos-tendered-input"
                type="number"
                min={0}
                step="any"
                value={amountTenderedInput}
                onChange={(e) => {
                  setAmountTenderedInput(e.target.value);
                  if (checkoutError) setCheckoutError(null);
                }}
                placeholder="Enter amount tendered..."
                data-testid="amount-tendered-input"
                className={`w-full bg-white dark:bg-carbon-elevated border rounded px-3 py-1.5 text-sm font-bold font-mono text-zinc-950 dark:text-zinc-50 tabular-nums focus:outline-none ${
                  isTenderInsufficient
                    ? 'border-red-500 focus:border-red-600'
                    : 'border-zinc-300 dark:border-zinc-700 focus:border-zinc-950 dark:focus:border-amber-500'
                }`}
              />
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                  setAmountTenderedInput(totalAmount > 0 ? totalAmount.toFixed(2) : '0');
                  setCheckoutError(null);
                }}
                data-testid="exact-tender-btn"
                className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold shrink-0 cursor-pointer transition-colors"
              >
                Exact
              </button>
            </div>
            {(isTenderInsufficient || checkoutError) && (
              <p
                data-testid="pos-checkout-error"
                className="mt-1.5 text-[11px] text-red-700 dark:text-rose-400 flex items-center gap-1"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                <span>
                  {isTenderInsufficient
                    ? `Insufficient amount: short by ${formatCurrency(shortfallAmount, currencySymbol)}`
                    : checkoutError}
                </span>
              </p>
            )}
          </div>

          {/* Price Breakdown Box */}
          <div className="p-3.5 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 space-y-1.5 text-xs font-mono tabular-nums">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currencySymbol)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-amber-800 dark:text-amber-400 font-semibold">
                <span>Discount</span>
                <span>-{formatCurrency(discountAmount, currencySymbol)}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>12% VAT ({taxInclusive ? 'Included' : 'Added'})</span>
              <span>{formatCurrency(taxAmount, currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-zinc-950 dark:text-zinc-50 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span>Total Due</span>
              <span data-testid="pos-total-due" className="text-amber-800 dark:text-amber-400 text-lg tabular-nums">
                {formatCurrency(totalAmount, currencySymbol)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canCompleteSale}
            data-testid="complete-sale-btn"
            className="w-full py-3 px-4 rounded-md bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
            <span>Complete Checkout & Issue Official Receipt</span>
          </button>
        </form>
      </div>

      {/* Printable Official Receipt Modal */}
      <ReceiptQuoteModal
        open={Boolean(completedOrder)}
        onClose={() => setCompletedOrder(null)}
        storeName={storeName}
        currencySymbol={currencySymbol}
        order={completedOrder}
      />
    </div>
  );
}
