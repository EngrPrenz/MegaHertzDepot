import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import { buildAdjustmentStockMap } from '../services/publicCatalogSync.js';
import { ProductImage } from '../components/ProductImage.js';
import { HARDWARE_CATEGORIES, HardwareCategory } from '@countwise/shared';
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
  Save,
} from 'lucide-react';

interface QuickCountPageProps {
  storeId: string;
  userId: string;
}

/**
 * Rapid shelf-counting & bulk physical audit screen.
 * Supports:
 * 1. "Fast Batch Table" - filter by category/search, edit physical counts across rows,
 *    verify single rows, or bulk-confirm remaining/modified items at once.
 * 2. "Single Card Walk" - thumb-friendly single-card stepper for aisle checks.
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

  const stockByProduct = useMemo(
    () => buildAdjustmentStockMap(products, adjustments),
    [products, adjustments]
  );

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

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
          : 'All visible items in this filter are already verified.'
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
        `Verified ${targets.length} item${targets.length === 1 ? '' : 's'} successfully.`
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
      <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-10 text-center space-y-2">
        <Layers className="w-8 h-8 text-zinc-400 mx-auto" strokeWidth={1.75} />
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">No Products to Count</h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Add products in Inventory first to start a shelf-counting session.
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
    <div className="space-y-4">
      {toastMsg && (
        <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" strokeWidth={1.75} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Session Progress & Mode Switcher Header */}
      <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 rounded-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
              <span>
                Quick Shelf Count ({completedCount} / {sortedProducts.length} verified)
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 tabular-nums">
                {progressPct}%
              </span>
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Audit by hardware category or bulk-verify matching shelf counts in one action.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Batch Table vs Single Card Walk */}
            <div className="inline-flex rounded-md bg-zinc-100 dark:bg-carbon-elevated p-1 border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setViewMode('batch')}
                className={`px-3 py-1.5 rounded text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'batch'
                    ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Fast Batch Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`px-3 py-1.5 rounded text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'card'
                    ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" strokeWidth={1.75} />
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
              className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Reset session</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-[width] duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Filters & Bulk Action Bar */}
        <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All');
                setCurrentIndex(0);
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                selectedCategory === 'All'
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                  : 'bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
              }`}
            >
              All ({sortedProducts.length})
            </button>
            {HARDWARE_CATEGORIES.map((cat) => {
              const catProducts = sortedProducts.filter((p) => p.category === cat);
              const catVerified = catProducts.filter(
                (p) => countedInSession[p.id] !== undefined
              ).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setCurrentIndex(0);
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    selectedCategory === cat
                      ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                      : catVerified === catProducts.length && catProducts.length > 0
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span>{cat}</span>
                  <span className="font-mono text-[11px] opacity-80 tabular-nums">
                    {catVerified}/{catProducts.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search, Status Filter & Bulk Confirm Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 max-w-xs min-w-[180px]">
                <Search
                  className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  strokeWidth={1.75}
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentIndex(0);
                  }}
                  placeholder="Search SKU, name, or brand..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
                />
              </div>

              <select
                aria-label="Filter verification status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | 'unverified' | 'verified');
                  setCurrentIndex(0);
                }}
                className="px-2.5 py-1.5 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-950 cursor-pointer"
              >
                <option value="all">Show: All ({filteredProducts.length})</option>
                <option value="unverified">Unverified Only ({unverifiedFilteredCount})</option>
                <option value="verified">
                  Verified ({filteredProducts.length - unverifiedFilteredCount})
                </option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {modifiedDraftsCount > 0 && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => handleBulkConfirm('modified-only')}
                  className="px-3.5 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Save {modifiedDraftsCount} Edited Count(s)</span>
                </button>
              )}

              <button
                type="button"
                disabled={bulkBusy || unverifiedFilteredCount === 0}
                onClick={() => handleBulkConfirm('all-filtered')}
                data-testid="bulk-verify-all-btn"
                className="px-3.5 py-1.5 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <CheckCheck className="w-4 h-4" strokeWidth={1.75} />
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

      {/* VIEW 1: FAST BATCH TABLE MODE */}
      {viewMode === 'batch' ? (
        <div
          className="table-wrapper bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg"
          tabIndex={0}
          role="region"
          aria-label="Shelf count audit list"
        >
          {filteredProducts.length === 0 ? (
            <div className="p-10 text-center text-zinc-500 dark:text-zinc-400 text-xs">
              No products match your current category or search filter.
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-carbon-elevated border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Hardware Item</th>
                    <th className="px-4 py-2.5 text-right">Expected</th>
                    <th className="px-4 py-2.5">Physical Count</th>
                    <th className="px-4 py-2.5 text-right">Delta</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredProducts.map((product) => {
                    const expected = stockByProduct.get(product.id) ?? 0;
                    const effective = getBatchEffectiveCount(product.id);
                    const delta = effective - expected;
                    const isVerified = countedInSession[product.id] !== undefined;
                    const hasDraft = batchDrafts[product.id] !== undefined;

                    return (
                      <tr
                        key={product.id}
                        className={`transition-colors ${
                          isVerified
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/35'
                            : hasDraft && delta !== 0
                            ? 'bg-amber-50/60 dark:bg-amber-950/20'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <td data-label="Hardware Item" className="px-4 py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <ProductImage
                              imageUrl={product.imageUrl}
                              sku={product.sku}
                              name={product.name}
                              category={product.category}
                              className="w-10 h-10 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                  {product.name}
                                </span>
                                {isVerified && (
                                  <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
                                    Verified ({countedInSession[product.id]})
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                <span className="font-medium text-amber-800 dark:text-amber-400">{product.category}</span>
                                {product.sku && <span className="font-mono">{product.sku}</span>}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td
                          data-label="Expected"
                          className="px-4 py-2.5 text-right font-mono font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums"
                        >
                          {expected}
                        </td>

                        <td data-label="Physical Count" className="px-4 py-2.5">
                          <div className="flex items-center sm:justify-start justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => stepBatchDraft(product.id, -5)}
                              aria-label={`Subtract 5 from ${product.name}`}
                              className="px-2 py-1 rounded bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer"
                            >
                              -5
                            </button>
                            <button
                              type="button"
                              onClick={() => stepBatchDraft(product.id, -1)}
                              aria-label={`Subtract 1 from ${product.name}`}
                              className="w-7 h-7 rounded bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-800 dark:text-zinc-200 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>

                            <input
                              type="number"
                              min={0}
                              aria-label={`Physical count for ${product.name}`}
                              value={
                                batchDrafts[product.id] !== undefined
                                  ? batchDrafts[product.id]
                                  : String(expected)
                              }
                              onChange={(e) => setBatchDraftValue(product.id, e.target.value)}
                              className={`w-14 h-7 text-center text-xs font-mono font-bold rounded bg-white dark:bg-zinc-900 border tabular-nums focus:outline-none ${
                                delta !== 0
                                  ? 'border-amber-500 text-amber-800 dark:text-amber-300'
                                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-950 dark:text-zinc-50 focus:border-zinc-950'
                              }`}
                            />

                            <button
                              type="button"
                              onClick={() => stepBatchDraft(product.id, 1)}
                              aria-label={`Add 1 to ${product.name}`}
                              className="w-7 h-7 rounded bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-950 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-800 dark:text-amber-300 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              onClick={() => stepBatchDraft(product.id, 5)}
                              aria-label={`Add 5 to ${product.name}`}
                              className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-950 border border-amber-300 dark:border-amber-800 text-xs font-mono font-semibold text-amber-800 dark:text-amber-300 cursor-pointer"
                            >
                              +5
                            </button>
                          </div>
                        </td>

                        <td data-label="Delta" className="px-4 py-2.5 text-right tabular-nums">
                          {delta !== 0 ? (
                            <span
                              className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                                delta > 0
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                  : 'bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-300 border border-red-200 dark:border-rose-800'
                              }`}
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          ) : (
                            <span className="font-mono text-zinc-400">0</span>
                          )}
                        </td>

                        <td data-label="Action" className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleConfirmSingleRow(product)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                              isVerified && !hasDraft
                                ? 'bg-white dark:bg-carbon-elevated text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                                : 'bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>{isVerified && !hasDraft ? 'Re-verify' : 'Verify'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* VIEW 2: SINGLE CARD WALK MODE */
        currentProduct && (
          <div className="max-w-xl mx-auto bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-6 sm:p-7 rounded-lg space-y-5 text-center">
            <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => {
                  setCurrentIndex((i) => Math.max(0, i - 1));
                  setDraftCount('');
                }}
                className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
                <span>Prev</span>
              </button>

              <span className="font-mono tabular-nums">
                Item {currentIndex + 1} of {filteredProducts.length}
              </span>

              <button
                type="button"
                disabled={currentIndex >= filteredProducts.length - 1}
                onClick={() => {
                  setCurrentIndex((i) => Math.min(filteredProducts.length - 1, i + 1));
                  setDraftCount('');
                }}
                className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Skip</span>
                <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3">
              <ProductImage
                imageUrl={currentProduct.imageUrl}
                sku={currentProduct.sku}
                name={currentProduct.name}
                category={currentProduct.category}
                className="w-24 h-24"
              />
              <div>
                {currentProduct.sku && (
                  <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                    {currentProduct.sku}
                  </span>
                )}
                <h2 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 mt-2">{currentProduct.name}</h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 tabular-nums">
                  Expected Local Stock:{' '}
                  <strong className="text-zinc-950 dark:text-zinc-50 font-mono">{currentExpectedStock}</strong>
                </p>
              </div>
            </div>

            {/* Large Touch-Friendly Count Input */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => adjustCardDraft(-5)}
                  className="w-12 h-12 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer transition-colors"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => adjustCardDraft(-1)}
                  aria-label="Decrease physical count by 1"
                  className="w-14 h-14 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-900 dark:text-zinc-100 cursor-pointer transition-colors"
                >
                  <Minus className="w-5 h-5" strokeWidth={1.75} />
                </button>

                <input
                  type="number"
                  aria-label="Physical count"
                  value={draftCount !== '' ? draftCount : String(currentExpectedStock)}
                  onChange={(e) => setDraftCount(e.target.value)}
                  data-testid="quick-count-input"
                  className="w-28 h-14 text-center text-2xl font-bold bg-white dark:bg-zinc-900 border-2 border-zinc-950 dark:border-amber-500 rounded-md text-zinc-950 dark:text-zinc-50 tabular-nums focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => adjustCardDraft(1)}
                  aria-label="Increase physical count by 1"
                  className="w-14 h-14 rounded-md bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-950 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-800 dark:text-amber-300 cursor-pointer transition-colors"
                >
                  <Plus className="w-5 h-5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => adjustCardDraft(5)}
                  className="w-12 h-12 rounded-md bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-950 border border-amber-300 dark:border-amber-800 text-sm font-semibold text-amber-800 dark:text-amber-300 cursor-pointer transition-colors"
                >
                  +5
                </button>
              </div>

              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                Adjustment Delta to Record:{' '}
                <span
                  className={`font-mono font-bold tabular-nums ${
                    computedCardDelta > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : computedCardDelta < 0
                      ? 'text-red-700 dark:text-rose-400'
                      : 'text-zinc-800 dark:text-zinc-200'
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
              className="w-full py-3 px-5 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
              <span>Confirm Count & Next Shelf Item</span>
            </button>
          </div>
        )
      )}
    </div>
  );
}
