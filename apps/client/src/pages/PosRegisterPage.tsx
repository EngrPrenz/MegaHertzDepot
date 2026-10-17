import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal, SaleOrderLocal } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
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
  Sparkles,
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
  const [completedOrder, setCompletedOrder] = useState<SaleOrderLocal | null>(null);
  const [seeding, setSeeding] = useState(false);

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

  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const adj of adjustments) {
      map.set(adj.productId, (map.get(adj.productId) || 0) + adj.delta);
    }
    return map;
  }, [adjustments]);

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
      // 12% VAT already included in retail prices: VAT = Total - (Total / 1.12)
      return Math.round((netAfterDiscount - netAfterDiscount / (1 + taxRate / 100)) * 100) / 100;
    }
    return Math.round(netAfterDiscount * (taxRate / 100) * 100) / 100;
  }, [netAfterDiscount, taxInclusive, taxRate]);

  const totalAmount = taxInclusive ? netAfterDiscount : netAfterDiscount + taxAmount;

  const amountTendered =
    amountTenderedInput !== '' ? parseFloat(amountTenderedInput) || 0 : totalAmount;
  const changeDue = Math.max(0, amountTendered - totalAmount);

  const handleCompleteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

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
      amountTendered: Math.max(totalAmount, amountTendered),
      changeDue,
    });

    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDiscountInput('0');
    setAmountTenderedInput('');
    setCompletedOrder(order);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left 7 Columns: Hardware Catalog Grid */}
      <div className="lg:col-span-7 space-y-4">
        {/* Search & Seed Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search CPU, GPU, RAM, SKU, or socket (e.g. AM5, DDR5, 4070)..."
              data-testid="pos-search-input"
              className="w-full bg-stone-900/90 border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
            />
          </div>

          {products.length === 0 && (
            <button
              type="button"
              onClick={handleSeedCatalog}
              disabled={seeding}
              data-testid="seed-hardware-btn"
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-950/40 cursor-pointer shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>{seeding ? 'Seeding...' : 'Seed Sample PC Hardware'}</span>
            </button>
          )}
        </div>

        {/* Hardware Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-white'
            }`}
          >
            All Parts ({products.length})
          </button>
          {HARDWARE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                  : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Empty State with 1-Click Sample Hardware Seeder */}
        {products.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center space-y-4 border border-amber-500/20">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Cpu className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-white">
                Welcome to MegaHertz Depot POS
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed">
                Load our curated 14-item PC Hardware Catalog (Ryzen 7 7800X3D, Core i5-14600K, RTX
                4070 Super, AM5 & LGA1700 Motherboards, DDR5/DDR4 RAM, NVMe SSD, PSU, Case &
                Peripherals) to test offline POS checkout and PC Rig building immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSeedCatalog}
              disabled={seeding}
              data-testid="empty-seed-hardware-btn"
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Seed Sample PC Hardware Catalog (14 Items)</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[68vh] overflow-y-auto pr-1">
            {catalogItems.map(({ product, stock }) => {
              const isOversold = stock < 0;
              const isLowStock = stock <= lowStockThreshold;
              return (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  data-testid={`pos-card-${product.sku || product.name}`}
                  className="glass-panel-interactive rounded-2xl p-3.5 flex flex-col justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-start gap-3">
                    <ProductImage
                      imageUrl={product.imageUrl}
                      name={product.name}
                      category={product.category}
                      className="w-14 h-14 rounded-xl shrink-0 group-hover:scale-105 transition-transform"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-stone-950 text-amber-400 border border-amber-500/30 truncate">
                          {product.category || 'Hardware'}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded-full shrink-0 ${
                            isOversold
                              ? 'bg-red-950/80 text-red-300 border border-red-800'
                              : isLowStock
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                              : 'bg-stone-950 text-stone-300 border border-stone-800'
                          }`}
                        >
                          {isOversold ? `Oversold (${stock})` : `${stock} in stock`}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors line-clamp-2 leading-tight">
                        {product.name}
                      </h4>

                      <div className="flex items-center flex-wrap gap-1 text-[9px] text-stone-400 font-mono">
                        {product.brand && <span>{product.brand}</span>}
                        {product.specs?.socket && (
                          <span className="px-1.5 py-0.2 rounded bg-stone-800 text-stone-300 border border-stone-700/60">
                            {product.specs.socket}
                          </span>
                        )}
                        {product.specs?.ramType && (
                          <span className="px-1.5 py-0.2 rounded bg-stone-800 text-stone-300 border border-stone-700/60">
                            {product.specs.ramType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-stone-800/80">
                    <div>
                      <div className="text-sm font-extrabold text-amber-400 font-mono tabular-nums">
                        {formatCurrency(product.price || 0, currencySymbol)}
                      </div>
                      {product.warranty && (
                        <div className="text-[9px] text-stone-500 flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5 text-amber-500/80" />
                          <span className="truncate max-w-[120px]">{product.warranty}</span>
                        </div>
                      )}
                    </div>

                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 group-hover:bg-amber-500 text-amber-300 group-hover:text-stone-950 flex items-center justify-center transition-colors">
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right 5 Columns: Active Register Cart & Checkout */}
      <div className="lg:col-span-5 glass-panel rounded-2xl p-5 flex flex-col justify-between space-y-4 self-start sticky top-20 border border-stone-800">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">
              POS Register Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
            </h3>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-stone-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Cart Items List */}
        {cart.length === 0 ? (
          <div className="py-12 text-center space-y-2 text-stone-500">
            <ShoppingCart className="w-8 h-8 mx-auto opacity-40 text-stone-600" />
            <p className="text-xs">
              Click any hardware component on the left to add it to the current sale.
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
                  className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">
                        {item.product.name}
                      </div>
                      <div className="text-[11px] text-stone-400">
                        {formatCurrency(item.product.price || 0, currencySymbol)} each •{' '}
                        <span className="text-amber-400/90">
                          {item.product.warranty || '1 Yr Warranty'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-bold text-amber-400 font-mono shrink-0">
                      {formatCurrency((item.product.price || 0) * item.quantity, currencySymbol)}
                    </div>
                  </div>

                  {willOversell && (
                    <div className="text-[10px] text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>
                        Offline sale allowed: local stock ({currentStock}) will go negative and
                        flag a backorder alert on sync.
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => toggleSerialInput(item.product.id)}
                      className="text-[11px] text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Barcode className="w-3.5 h-3.5" />
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
                        className="w-7 h-7 rounded-lg bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-white cursor-pointer transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-bold font-mono tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.id, 1)}
                        className="w-7 h-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {item.showSerialInput && (
                    <div className="space-y-1.5 pt-1.5 border-t border-stone-800/80">
                      {item.serialNumbers.map((sn, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={sn}
                          onChange={(e) =>
                            updateSerialNumber(item.product.id, idx, e.target.value)
                          }
                          placeholder={`Unit #${idx + 1} Serial Number (S/N) for Warranty`}
                          className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1 text-[11px] font-mono text-amber-200 placeholder-stone-600 focus:outline-none focus:border-amber-500"
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
        <form onSubmit={handleCompleteSale} className="space-y-3 pt-3 border-t border-stone-800">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer Name (Optional)"
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone / Contact"
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Discount & VAT Toggle Row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-stone-400">Discount</span>
                <div className="flex rounded-lg bg-stone-950 p-0.5 border border-stone-800 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      discountType === 'fixed' ? 'bg-amber-500 text-stone-950 font-bold' : 'text-stone-400'
                    }`}
                  >
                    {currencySymbol}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      discountType === 'percent' ? 'bg-amber-500 text-stone-950 font-bold' : 'text-stone-400'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <input
                type="number"
                min={0}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-stone-400 mb-1">12% VAT Mode</label>
              <button
                type="button"
                onClick={() => setTaxInclusive((v) => !v)}
                className="w-full py-1.5 px-3 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 font-medium cursor-pointer hover:border-amber-500/40 transition-colors"
              >
                {taxInclusive ? '12% VAT Inclusive' : '12% VAT Exclusive (+12%)'}
              </button>
            </div>
          </div>

          {/* Payment Method Pills */}
          <div className="space-y-1">
            <label className="block text-[11px] text-stone-400">Payment Method</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['Cash', 'GCash', 'Maya', 'Card', 'Split'] as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 rounded-xl text-[11px] font-semibold border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    paymentMethod === method
                      ? 'bg-amber-500 text-stone-950 font-bold shadow-sm border-amber-500'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white hover:border-stone-700'
                  }`}
                >
                  {method === 'Cash' ? (
                    <Banknote className="w-3.5 h-3.5" />
                  ) : method === 'Card' ? (
                    <CreditCard className="w-3.5 h-3.5" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5" />
                  )}
                  <span>{method}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tendered Input */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1">
              <span>Amount Tendered ({currencySymbol})</span>
              <span>
                Change Due:{' '}
                <strong className="text-amber-400 font-mono">
                  {formatCurrency(changeDue, currencySymbol)}
                </strong>
              </span>
            </div>
            <input
              type="number"
              min={0}
              step="any"
              value={amountTenderedInput}
              onChange={(e) => setAmountTenderedInput(e.target.value)}
              placeholder={String(totalAmount)}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Price Breakdown Box */}
          <div className="p-3.5 rounded-xl bg-stone-950/90 border border-stone-800/80 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-stone-400">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currencySymbol)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-amber-400 font-semibold">
                <span>Discount</span>
                <span>-{formatCurrency(discountAmount, currencySymbol)}</span>
              </div>
            )}
            <div className="flex justify-between text-stone-400">
              <span>12% VAT ({taxInclusive ? 'Included' : 'Added'})</span>
              <span>{formatCurrency(taxAmount, currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-stone-800">
              <span>Total Due</span>
              <span data-testid="pos-total-due" className="text-amber-400 text-lg">
                {formatCurrency(totalAmount, currencySymbol)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={cart.length === 0}
            data-testid="complete-sale-btn"
            className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-amber-950/40 cursor-pointer transition-all active:scale-[0.99]"
          >
            <CheckCircle2 className="w-4 h-4" />
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
