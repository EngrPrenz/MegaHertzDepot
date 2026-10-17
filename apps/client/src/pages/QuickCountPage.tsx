import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import { computeDerivedStock } from '@countwise/shared';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-react';

interface QuickCountPageProps {
  storeId: string;
  userId: string;
}

/**
 * Thumb-friendly mobile shelf-walking mode (Section 11.5 & Week 5).
 * Allows staff in a back room with no signal to step through products rapidly,
 * enter physical counts, and compute commutative deltas automatically.
 */
export function QuickCountPage({ storeId, userId }: QuickCountPageProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [countedInSession, setCountedInSession] = useState<Record<string, number>>({});
  const [draftCount, setDraftCount] = useState<string>('');

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

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const currentProduct = sortedProducts[currentIndex] || null;

  const currentExpectedStock = useMemo(() => {
    if (!currentProduct) return 0;
    const prodAdjs = adjustments.filter((a) => a.productId === currentProduct.id);
    return computeDerivedStock(prodAdjs);
  }, [currentProduct, adjustments]);

  const effectiveCount =
    draftCount !== '' ? parseInt(draftCount, 10) || 0 : currentExpectedStock;
  const computedDelta = effectiveCount - currentExpectedStock;

  const handleConfirmCount = async () => {
    if (!currentProduct) return;
    await localRepository.recordPhysicalCount({
      productId: currentProduct.id,
      storeId,
      countedPhysical: effectiveCount,
      userId,
    });

    setCountedInSession((prev) => ({
      ...prev,
      [currentProduct.id]: effectiveCount,
    }));
    setDraftCount('');

    if (currentIndex < sortedProducts.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const adjustDraft = (step: number) => {
    const next = Math.max(0, effectiveCount + step);
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

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Session Progress Header */}
      <div className="glass-panel p-4 rounded-2xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">
            Quick Shelf Count ({completedCount} / {sortedProducts.length} verified)
          </span>
          <button
            type="button"
            onClick={() => {
              setCountedInSession({});
              setCurrentIndex(0);
              setDraftCount('');
            }}
            className="text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset session</span>
          </button>
        </div>
        <div className="w-full h-2 rounded-full bg-stone-900 overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Active Product Thumb Card */}
      {currentProduct && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl space-y-6 text-center">
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
              Item {currentIndex + 1} of {sortedProducts.length}
            </span>

            <button
              type="button"
              disabled={currentIndex >= sortedProducts.length - 1}
              onClick={() => {
                setCurrentIndex((i) => Math.min(sortedProducts.length - 1, i + 1));
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
              Expected Local Stock: <strong className="text-stone-200">{currentExpectedStock}</strong>
            </p>
          </div>

          {/* Large Touch-Friendly Count Input */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => adjustDraft(-5)}
                className="w-12 h-12 rounded-2xl bg-stone-900 hover:bg-stone-800 active:scale-95 border border-stone-800 text-sm font-bold text-stone-300 cursor-pointer"
              >
                -5
              </button>
              <button
                type="button"
                onClick={() => adjustDraft(-1)}
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
                onClick={() => adjustDraft(1)}
                className="w-14 h-14 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
              >
                <Plus className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => adjustDraft(5)}
                className="w-12 h-12 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/40 text-sm font-bold text-amber-300 cursor-pointer"
              >
                +5
              </button>
            </div>

            <div className="text-xs text-stone-400">
              Adjustment Delta to Enqueue:{' '}
              <span
                className={`font-mono font-bold ${
                  computedDelta > 0
                    ? 'text-amber-400'
                    : computedDelta < 0
                    ? 'text-rose-400'
                    : 'text-stone-300'
                }`}
              >
                {computedDelta >= 0 ? `+${computedDelta}` : computedDelta}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConfirmCount}
            data-testid="confirm-shelf-count-btn"
            className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Confirm Count & Next Shelf Item</span>
          </button>
        </div>
      )}
    </div>
  );
}

