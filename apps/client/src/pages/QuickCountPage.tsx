import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal, AdjustmentLocal } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import { ProductImage } from '../components/ProductImage.js';
import {
  computeDerivedStock,
  HARDWARE_CATEGORIES,
  HardwareCategory,
} from '@countwise/shared';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Plus,
  Minus,
  RotateCcw,
  Search,
  ListChecks,
  CreditCard,
  CheckCheck,
  Sparkles,
} from 'lucide-react';

interface QuickCountPageProps {
  storeId: string;
  userId: string;
}

/**
 * Rapid shelf-counting & bulk physical audit screen (Section 11.5 & Week 5).
 * Supports both:
 * 1. "Batch Table Mode" — filter by category/search, edit physical counts across rows,
 *    1-click verify single items, or bulk-confirm all remaining/category items at once.
 * 2. "Card Walk Mode" — thumb-friendly single-card stepper with category filter & jump.
 */
export function QuickCountPage({ storeId, userId }: QuickCountPageProps) {
  const [viewMode, setViewMode] = useState<'batch' | 'card'>('batch');
  const [selectedCategory, setSelectedCategory] = useState<HardwareCategory | 'All'>('All');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unverified' | 'verified'>('all');

  // Card mode index + single-card draft
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draftCount, setDraftCount] = useState<string>('');

  // Session state: productIds verified in this session -> physical count recorded
  const [countedInSession, setCountedInSession] = useState<Record<string, number>>({});
  // Batch table draft counts per productId (when edited before confirming)
  const [batchDrafts, setBatchDrafts] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

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

  // Compute expected stock for all products in one pass
  const stockByProduct = useMemo(() => {
    const grouped = new Map<string, AdjustmentLocal[]>();
    for (const adj of adjustments) {
      const list = grouped.get(adj.productId);
      if (list) list.push(adj);
      else grouped.set(adj.productId, [adj]);
    }
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.id, computeDerivedStock(grouped.get(p.id) || []));
    }
    return map;
  }, [products, adjustments]);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  // Filtered products based on Category, Search, and Verified status
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedProducts.filter((p) => {
      if (selectedCategory !== 'All' && p.category !== selectedCategory) {
        return false;
      }
      const isVerified = countedInSession[p.id] !== undefined;
      if (statusFilter === 'unverified' && isVerified) return false;
      if (statusFilter === 'verified' && !isVerified) return false;
      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
        const matchBrand = p.brand ? p.brand.toLowerCase().includes(q) : false;
        if (!matchName && !matchSku && !matchBrand) return false;
      }
      return true;
    });
  }, [sortedProducts, selectedCategory, search, statusFilter, countedInSession]);

  // Keep card mode index in bounds when filter changes
  useEffect(() => {
    if (currentIndex >= filteredProducts.length) {
      setCurrentIndex(Math.max(0, filteredProducts.length - 1));
    }
  }, [filteredProducts.length, currentIndex]);

  const currentProduct = filteredProducts[currentIndex] || null;
  const currentExpectedStock = currentProduct ? stockByProduct.get(currentProduct.id) ?? 0 : 0;

  const effectiveCardCount =
    draftCount !== '' ? Math.max(0, parseInt(draftCount, 10) || 0) : currentExpectedStock;
  const computedCardDelta = effectiveCardCount - currentExpectedStock;

  // Helper to get effective count for a product in Batch Table mode
  const getBatchEffectiveCount = (productId: string): number => {
    const draft = batchDrafts[productId];
    if (draft !== undefined && draft !== '') {
      const parsed = parseInt(draft, 10);
      return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }
    return stockByProduct.get(productId) ?? 0;
  };

  const setBatchDraftValue = (productId: string, val: string) => {
    setBatchDrafts((prev) => ({
      ...prev,
      [productId]: val,
    }));
  };

  const stepBatchDraft = (productId: string, step: number) => {
    const currentVal = getBatchEffectiveCount(productId);
    const nextVal = Math.max(0, currentVal + step);
    setBatchDraftValue(productId, String(nextVal));
  };

  // Single-card confirm handler
  const handleConfirmCardCount = async () => {
    if (!currentProduct) return;
    await localRepository.recordPhysicalCount({
      productId: currentProduct.id,
      storeId,
      countedPhysical: effectiveCardCount,
      userId,
    });

    setCountedInSession((prev) => ({
      ...prev,
      [currentProduct.id]: effectiveCardCount,
    }));
    setDraftCount('');

    if (currentIndex < filteredProducts.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  // Single row confirm in Batch mode
  const handleConfirmSingleRow = async (product: ProductLocal) => {
    const countVal = getBatchEffectiveCount(product.id);
    await localRepository.recordPhysicalCount({
      productId: product.id,
      storeId,
      countedPhysical: countVal,
      userId,
    });
    setCountedInSession((prev) => ({
      ...prev,
      [product.id]: countVal,
    }));
    setBatchDrafts((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  };

  // Bulk confirm all modified drafts OR all unverified items in the current filtered view
  const handleBulkConfirm = async (mode: 'modified-only' | 'all-filtered') => {
    const targets =
      mode === 'modified-only'
        ? filteredProducts.filter((p) => {
            const draft = batchDrafts[p.id];
            if (draft === undefined || draft === '') return false;
            return getBatchEffectiveCount(p.id) !== (stockByProduct.get(p.id) ?? 0);
          })
        : filteredProducts.filter((p) => countedInSession[p.id] === undefined);

    if (targets.length === 0) {
      showToast(
        mode === 'modified-only'
          ? 'No modified counts to save.'
          : 'All visible items in this filter are already verified!'
      );
      return;
    }

    setBulkBusy(true);
    try {
      const nextVerified: Record<string, number> = {};
      for (const product of targets) {
        const countVal = getBatchEffectiveCount(product.id);
        await localRepository.recordPhysicalCount({
          productId: product.id,
          storeId,
          countedPhysical: countVal,
          userId,
        });
        nextVerified[product.id] = countVal;
      }

      setCountedInSession((prev) => ({
        ...prev,
        ...nextVerified,
      }));
      setBatchDrafts((prev) => {
        const next = { ...prev };
        for (const p of targets) {
          delete next[p.id];
        }
        return next;
      });

      showToast(
        `Verified ${targets.length} item${targets.length === 1 ? '' : 's'} in 1 click!`
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const adjustCardDraft = (step: number) => {
    const next = Math.max(0, effectiveCardCount + step);
    setDraftCount(String(next));
  };

  if (sortedProducts.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-10 text-center space-y-2">
        <Layers className="w-8 h-8 text-slate-500 mx-auto" />
        <h3 className="text-sm font-semibold text-white">No Products to Count</h3>
        <p className="text-xs text-slate-400">
          Add products on the Inventory tab first to start a rapid shelf-counting session.
        </p>
      </div>
    );
  }

  const completedCount = Object.keys(countedInSession).length;
  const progressPct = Math.round((completedCount / sortedProducts.length) * 100);
  const unverifiedFilteredCount = filteredProducts.filter(
    (p) => countedInSession[p.id] === undefined
  ).length;
  const modifiedDraftsCount = filteredProducts.filter((p) => {
    const draft = batchDrafts[p.id];
    if (draft === undefined || draft === '') return false;
    return getBatchEffectiveCount(p.id) !== (stockByProduct.get(p.id) ?? 0);
  }).length;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {toastMsg && (
        <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-700/80 text-amber-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Session Progress & Mode Switcher Header */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Quick Shelf Count ({completedCount} / {sortedProducts.length} verified)</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {progressPct}%
              </span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Audit by category or bulk-verify matching shelf stock in one click instead of confirming 142 items one by one.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Batch Table vs Single Card Walk */}
            <div className="inline-flex rounded-xl bg-stone-950 p-1 border border-stone-800">
              <button
                type="button"
                onClick={() => setViewMode('batch')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                  viewMode === 'batch'
                    ? 'bg-amber-500 text-stone-950 font-bold shadow'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>Fast Batch Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                  viewMode === 'card'
                    ? 'bg-amber-500 text-stone-950 font-bold shadow'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Single Card Walk</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCountedInSession({});
                setBatchDrafts({});
                setCurrentIndex(0);
                setDraftCount('');
              }}
              className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset session</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 rounded-full bg-stone-900 overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Filters & Bulk Action Bar */}
        <div className="pt-2 border-t border-stone-800/80 space-y-2.5">
          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All');
                setCurrentIndex(0);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-semibold shrink-0 transition cursor-pointer ${
                selectedCategory === 'All'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-white'
              }`}
            >
              All ({sortedProducts.length})
            </button>
            {HARDWARE_CATEGORIES.map((cat) => {
              const catProducts = sortedProducts.filter((p) => p.category === cat);
              const catVerified = catProducts.filter((p) => countedInSession[p.id] !== undefined).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setCurrentIndex(0);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                    selectedCategory === cat
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : catVerified === catProducts.length && catProducts.length > 0
                      ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60'
                      : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-white'
                  }`}
                >
                  <span>{cat}</span>
                  <span className="font-mono text-[10px] opacity-80">
                    {catVerified}/{catProducts.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search, Status Filter & 1-Click Bulk Confirm Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 max-w-xs min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentIndex(0);
                  }}
                  placeholder="Search SKU, name, or brand..."
                  className="w-full pl-8 pr-3 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <select
                aria-label="Filter verification status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | 'unverified' | 'verified');
                  setCurrentIndex(0);
                }}
                className="px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="all">Show: All ({filteredProducts.length})</option>
                <option value="unverified">Unverified Only ({unverifiedFilteredCount})</option>
                <option value="verified">
                  Verified ({filteredProducts.length - unverifiedFilteredCount})
                </option>
              </select>
            </div>

            {/* 1-Click Bulk Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {modifiedDraftsCount > 0 && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => handleBulkConfirm('modified-only')}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow cursor-pointer transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Save {modifiedDraftsCount} Edited Count(s)</span>
                </button>
              )}

              <button
                type="button"
                disabled={bulkBusy || unverifiedFilteredCount === 0}
                onClick={() => handleBulkConfirm('all-filtered')}
                data-testid="bulk-verify-all-btn"
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 text-xs font-bold inline-flex items-center gap-1.5 shadow-md shadow-amber-950/30 cursor-pointer transition"
              >
                <CheckCheck className="w-4 h-4" />
                <span>
                  {bulkBusy
                    ? 'Verifying...'
                    : selectedCategory === 'All'
                    ? `Verify All Remaining (${unverifiedFilteredCount})`
                    : `Verify All ${selectedCategory} (${unverifiedFilteredCount})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= VIEW 1: FAST BATCH TABLE MODE ================= */}
      {viewMode === 'batch' ? (
        <div className="glass-panel rounded-2xl overflow-hidden border border-stone-800">
          {filteredProducts.length === 0 ? (
            <div className="p-10 text-center text-stone-400 text-xs">
              No products match your current category or search filter.
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto divide-y divide-stone-800/70">
              {filteredProducts.map((product) => {
                const expected = stockByProduct.get(product.id) ?? 0;
                const effective = getBatchEffectiveCount(product.id);
                const delta = effective - expected;
                const isVerified = countedInSession[product.id] !== undefined;
                const hasDraft = batchDrafts[product.id] !== undefined;

                return (
                  <div
                    key={product.id}
                    className={`p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                      isVerified
                        ? 'bg-emerald-950/15 hover:bg-emerald-950/25'
                        : hasDraft && delta !== 0
                        ? 'bg-amber-950/20'
                        : 'hover:bg-stone-900/50'
                    }`}
                  >
                    {/* Left: Product Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ProductImage
                        imageUrl={product.imageUrl}
                        sku={product.sku}
                        name={product.name}
                        category={product.category}
                        className="w-11 h-11 rounded-xl shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-white text-xs sm:text-sm leading-snug">
                            {product.name}
                          </span>
                          {isVerified && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Verified ({countedInSession[product.id]})
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                          <span className="text-amber-400 font-semibold">{product.category}</span>
                          {product.sku && <span className="font-mono">• {product.sku}</span>}
                          <span>
                            • Expected: <strong className="text-stone-200 font-mono">{expected}</strong>
                          </span>
                          {delta !== 0 && (
                            <span
                              className={`font-mono font-bold px-1.5 py-0.2 rounded ${
                                delta > 0
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              Delta: {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Stepper & 1-Click Confirm */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => stepBatchDraft(product.id, -5)}
                          className="px-2 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-mono font-bold text-stone-300 cursor-pointer"
                        >
                          -5
                        </button>
                        <button
                          type="button"
                          onClick={() => stepBatchDraft(product.id, -1)}
                          className="w-8 h-8 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 flex items-center justify-center text-white cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <input
                          type="number"
                          min={0}
                          value={
                            batchDrafts[product.id] !== undefined
                              ? batchDrafts[product.id]
                              : String(expected)
                          }
                          onChange={(e) => setBatchDraftValue(product.id, e.target.value)}
                          className={`w-16 h-8 text-center text-sm font-mono font-bold rounded-lg bg-stone-950 border focus:outline-none ${
                            delta !== 0
                              ? 'border-amber-500 text-amber-300'
                              : 'border-stone-800 text-white focus:border-amber-500'
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => stepBatchDraft(product.id, 1)}
                          className="w-8 h-8 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 flex items-center justify-center text-amber-300 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => stepBatchDraft(product.id, 5)}
                          className="px-2 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-mono font-bold text-amber-300 cursor-pointer"
                        >
                          +5
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleConfirmSingleRow(product)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition ${
                          isVerified && !hasDraft
                            ? 'bg-stone-800 text-emerald-300 border border-emerald-800/50 hover:bg-stone-700'
                            : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-sm'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isVerified && !hasDraft ? 'Re-verify' : 'Verify'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ================= VIEW 2: SINGLE CARD WALK MODE ================= */
        currentProduct && (
          <div className="max-w-xl mx-auto glass-panel p-6 sm:p-8 rounded-3xl space-y-6 text-center">
            <div className="flex items-center justify-between text-xs text-stone-400">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => {
                  setCurrentIndex((i) => Math.max(0, i - 1));
                  setDraftCount('');
                }}
                className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>

              <span className="font-mono">
                Item {currentIndex + 1} of {filteredProducts.length}
              </span>

              <button
                type="button"
                disabled={currentIndex >= filteredProducts.length - 1}
                onClick={() => {
                  setCurrentIndex((i) => Math.min(filteredProducts.length - 1, i + 1));
                  setDraftCount('');
                }}
                className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Skip</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div>
              {currentProduct.sku && (
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-stone-900 border border-stone-800 text-stone-400">
                  {currentProduct.sku}
                </span>
              )}
              <h2 className="text-2xl font-extrabold text-white mt-2">{currentProduct.name}</h2>
              <p className="text-xs text-stone-400 mt-1">
                Expected Local Stock:{' '}
                <strong className="text-stone-200">{currentExpectedStock}</strong>
              </p>
            </div>

            {/* Large Touch-Friendly Count Input */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => adjustCardDraft(-5)}
                  className="w-12 h-12 rounded-2xl bg-stone-900 hover:bg-stone-800 active:scale-95 border border-stone-800 text-sm font-bold text-stone-300 cursor-pointer"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => adjustCardDraft(-1)}
                  className="w-14 h-14 rounded-2xl bg-stone-900 hover:bg-stone-800 active:scale-95 border border-stone-800 flex items-center justify-center text-white cursor-pointer"
                >
                  <Minus className="w-6 h-6" />
                </button>

                <input
                  type="number"
                  value={draftCount !== '' ? draftCount : String(currentExpectedStock)}
                  onChange={(e) => setDraftCount(e.target.value)}
                  data-testid="quick-count-input"
                  className="w-28 h-16 text-center text-3xl font-extrabold bg-stone-950 border-2 border-amber-500/50 rounded-2xl text-white focus:outline-none focus:border-amber-400"
                />

                <button
                  type="button"
                  onClick={() => adjustCardDraft(1)}
                  className="w-14 h-14 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
                >
                  <Plus className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={() => adjustCardDraft(5)}
                  className="w-12 h-12 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/40 text-sm font-bold text-amber-300 cursor-pointer"
                >
                  +5
                </button>
              </div>

              <div className="text-xs text-stone-400">
                Adjustment Delta to Enqueue:{' '}
                <span
                  className={`font-mono font-bold ${
                    computedCardDelta > 0
                      ? 'text-amber-400'
                      : computedCardDelta < 0
                      ? 'text-rose-400'
                      : 'text-stone-300'
                  }`}
                >
                  {computedCardDelta >= 0 ? `+${computedCardDelta}` : computedCardDelta}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirmCardCount}
              data-testid="confirm-shelf-count-btn"
              className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirm Count & Next Shelf Item</span>
            </button>
          </div>
        )
      )}
    </div>
  );
}
