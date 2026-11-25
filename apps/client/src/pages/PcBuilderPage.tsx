import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal } from '../db/index.js';
import { ReceiptQuoteModal, QuoteBuildData } from '../components/ReceiptQuoteModal.js';
import { ProductImage } from '../components/ProductImage.js';
import { StorefrontShell } from '../components/StorefrontShell.js';
import { ModalDialog } from '../components/ModalDialog.js';
import { PcRigWorkbench, getCategoryIcon } from '../components/PcRigWorkbench.js';
import { useCustomerCart } from '../hooks/useCustomerCart.js';
import { buildStockMap } from '../services/publicCatalogSync.js';
import {
  ALL_WORKBENCH_SLOTS,
  CuratedPresetId,
  MULTI_SLOT_CATEGORIES,
  autoFillBuildWithinBudget,
  diffBuildSnapshots,
  evaluatePartCompatibility,
  findCuratedPreset,
  resolveBuildFromSlotIds,
} from '../services/pcBuilderLogic.js';
import {
  HARDWARE_CATEGORIES,
  HardwareCategory,
  analyzePcBuildCompatibility,
  formatCurrency,
} from '@countwise/shared';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Bookmark,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Filter,
  GitCompare,
  Layers,
  PackageOpen,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';

interface PcBuilderPageProps {
  storeId: string;
  storeName: string;
  currencySymbol: string;
  onBack: () => void;
  onLoadBuildToCart?: (parts: ProductLocal[]) => void;
}

type SortOption = 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc';

const QUICK_BUDGETS = [50000, 85000, 130000, 200000];

function cloneSlotMap(
  source: Partial<Record<HardwareCategory, string[]>>
): Partial<Record<HardwareCategory, string[]>> {
  const cloned: Partial<Record<HardwareCategory, string[]>> = {};
  for (const key of ALL_WORKBENCH_SLOTS) {
    const val = source[key];
    if (val && val.length > 0) {
      cloned[key] = [...val];
    }
  }
  return cloned;
}

export function PcBuilderPage({
  storeId,
  storeName,
  currencySymbol,
  onBack,
  onLoadBuildToCart,
}: PcBuilderPageProps) {
  const cartState = useCustomerCart();

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
    () => buildStockMap(products, adjustments),
    [products, adjustments]
  );

  const productsByCategory = useMemo(() => {
    const map = new Map<HardwareCategory, ProductLocal[]>();
    for (const cat of HARDWARE_CATEGORIES) {
      map.set(cat, []);
    }
    for (const p of products) {
      const cat = p.category || 'Peripheral';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(p);
    }
    return map;
  }, [products]);

  const [activeCategory, setActiveCategory] = useState<HardwareCategory>('CPU');
  const [selectedBySlot, setSelectedBySlot] = useState<
    Partial<Record<HardwareCategory, string[]>>
  >({});
  const [snapshotA, setSnapshotA] = useState<Partial<Record<HardwareCategory, string[]>> | null>(
    null
  );
  const [leftView, setLeftView] = useState<'workbench' | 'manifest'>('workbench');
  const [workbenchViewMode, setWorkbenchViewMode] = useState<'assembled' | 'exploded'>('assembled');

  const [categorySearch, setCategorySearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('price-asc');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [compatibleOnly, setCompatibleOnly] = useState(true);

  const [targetBudgetInput, setTargetBudgetInput] = useState('85000');
  const [customerName, setCustomerName] = useState('');
  const [bundleDiscount, setBundleDiscount] = useState('0');
  const [activeQuote, setActiveQuote] = useState<QuoteBuildData | null>(null);
  const [copiedBuild, setCopiedBuild] = useState(false);
  const [snapshotSavedFeedback, setSnapshotSavedFeedback] = useState(false);

  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);

  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (e.matches) {
        setMobilePickerOpen(false);
      }
    };
    setIsDesktop(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const resolvedBuild = useMemo(
    () => resolveBuildFromSlotIds(selectedBySlot, products),
    [selectedBySlot, products]
  );

  const compatibility = useMemo(
    () => analyzePcBuildCompatibility(resolvedBuild.record),
    [resolvedBuild.record]
  );

  const subtotal = useMemo(
    () => resolvedBuild.list.reduce((sum, item) => sum + (item.product.price || 0), 0),
    [resolvedBuild.list]
  );

  const discountNum = Math.min(subtotal, Math.max(0, parseFloat(bundleDiscount) || 0));
  const totalAmount = Math.max(0, subtotal - discountNum);
  const parsedTargetBudget = Math.max(0, parseFloat(targetBudgetInput) || 0);

  const budgetBreakdown = useMemo(() => {
    let gpu = 0;
    let cpu = 0;
    let platform = 0;
    let other = 0;
    for (const item of resolvedBuild.list) {
      const price = item.product.price || 0;
      if (item.slot === 'GPU') gpu += price;
      else if (item.slot === 'CPU') cpu += price;
      else if (item.slot === 'Motherboard' || item.slot === 'RAM') platform += price;
      else other += price;
    }
    const denominator = Math.max(parsedTargetBudget, subtotal, 1);
    return {
      gpu,
      cpu,
      platform,
      other,
      gpuPct: (gpu / denominator) * 100,
      cpuPct: (cpu / denominator) * 100,
      platformPct: (platform / denominator) * 100,
      otherPct: (other / denominator) * 100,
      overBudget: parsedTargetBudget > 0 && subtotal > parsedTargetBudget,
      delta: parsedTargetBudget - subtotal,
    };
  }, [resolvedBuild.list, parsedTargetBudget, subtotal]);

  const handleSelectRigZone = (cat: HardwareCategory) => {
    setActiveCategory(cat);
    setCategorySearch('');
    setSelectedBrand('All');
    if (!isDesktop) {
      setMobilePickerOpen(true);
    }
  };

  const handleApplyPreset = (presetId: CuratedPresetId) => {
    const presetSlots = findCuratedPreset(presetId, products);
    setSelectedBySlot(presetSlots);
  };

  const handleAutoFill = () => {
    const budget = parsedTargetBudget > 0 ? parsedTargetBudget : 85000;
    const { nextSlots } = autoFillBuildWithinBudget(
      selectedBySlot,
      products,
      stockByProduct,
      budget
    );
    setSelectedBySlot(nextSlots);
  };

  const handleSaveSnapshotA = () => {
    setSnapshotA(cloneSlotMap(selectedBySlot));
    setSnapshotSavedFeedback(true);
    window.setTimeout(() => setSnapshotSavedFeedback(false), 1800);
  };

  const handleSwapSnapshots = () => {
    const prevA = snapshotA ? cloneSlotMap(snapshotA) : {};
    const prevB = cloneSlotMap(selectedBySlot);
    setSnapshotA(prevB);
    setSelectedBySlot(prevA);
  };

  const handleSelectPart = (cat: HardwareCategory, productId: string) => {
    setSelectedBySlot((prev) => {
      const current = prev[cat] || [];
      if (MULTI_SLOT_CATEGORIES.has(cat)) {
        if (current.includes(productId)) return prev;
        return { ...prev, [cat]: [...current, productId] };
      }
      return { ...prev, [cat]: [productId] };
    });
    if (!isDesktop && !MULTI_SLOT_CATEGORIES.has(cat)) {
      setMobilePickerOpen(false);
    }
  };

  const handleRemovePart = (cat: HardwareCategory, productId?: string) => {
    setSelectedBySlot((prev) => {
      const next = { ...prev };
      if (!productId || !next[cat]) {
        delete next[cat];
      } else {
        const filtered = next[cat]!.filter((id) => id !== productId);
        if (filtered.length === 0) {
          delete next[cat];
        } else {
          next[cat] = filtered;
        }
      }
      return next;
    });
  };

  const handleOpenQuote = () => {
    if (resolvedBuild.list.length === 0) return;
    const now = Date.now();
    const quoteNumber = `QT-${new Date(now).toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    setActiveQuote({
      customerName: customerName.trim() || 'Walk-in PC Builder',
      parts: resolvedBuild.list,
      subtotal,
      discountAmount: discountNum,
      totalAmount,
      compatibility,
      createdAt: now,
      quoteNumber,
    });
  };

  const handleCopyBuildList = async () => {
    if (resolvedBuild.list.length === 0) return;
    const lines = [
      `MegaHertzDepot Custom PC Rig Spec Sheet`,
      `Client: ${customerName.trim() || 'Walk-in PC Builder'}`,
      `Status: ${compatibility.isCompatible ? 'Compatibility Verified' : 'Review Required'} (${compatibility.estimatedSystemWatts}W Est. / Rec. ${compatibility.recommendedPsuWatts}W+ PSU)`,
      `----------------------------------------`,
      ...resolvedBuild.list.map(
        ({ slot, product }) =>
          `[${slot}] ${product.name} - ${formatCurrency(product.price || 0, currencySymbol)}`
      ),
      `----------------------------------------`,
      `Quoted Total: ${formatCurrency(totalAmount, currencySymbol)}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(lines);
      setCopiedBuild(true);
      window.setTimeout(() => setCopiedBuild(false), 2000);
    } catch {
      // Clipboard write unavailable in non-secure / restricted context
    }
  };

  const handleAddBuildToCart = () => {
    const parts = resolvedBuild.list.map((i) => i.product);
    if (parts.length === 0) return;
    if (onLoadBuildToCart) {
      onLoadBuildToCart(parts);
    } else {
      cartState.addPartsToCart(parts);
    }
  };

  const activeCategoryBrands = useMemo(() => {
    const list = productsByCategory.get(activeCategory) || [];
    const deduped = new Map<string, string>();
    for (const p of list) {
      const trimmed = p.brand?.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, trimmed);
      }
    }
    return Array.from(deduped.values()).sort((a, b) => a.localeCompare(b));
  }, [productsByCategory, activeCategory]);

  const categoryFilterResult = useMemo(() => {
    const list = productsByCategory.get(activeCategory) || [];
    const q = categorySearch.trim().toLowerCase();

    const baseFiltered = list.filter((p) => {
      if (inStockOnly && (stockByProduct.get(p.id) ?? 0) <= 0) {
        return false;
      }
      if (
        selectedBrand !== 'All' &&
        (p.brand || '').trim().toLowerCase() !== selectedBrand.toLowerCase()
      ) {
        return false;
      }
      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchBrand = p.brand ? p.brand.toLowerCase().includes(q) : false;
        const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
        const matchSocket = p.specs?.socket ? p.specs.socket.toLowerCase().includes(q) : false;
        const matchRam = p.specs?.ramType ? p.specs.ramType.toLowerCase().includes(q) : false;
        if (!matchName && !matchBrand && !matchSku && !matchSocket && !matchRam) {
          return false;
        }
      }
      return true;
    });

    const evaluated = baseFiltered.map((product) => ({
      product,
      evalResult: evaluatePartCompatibility(product, resolvedBuild.record, compatibility),
    }));

    let hiddenIncompatibleCount = 0;
    const finalItems = evaluated.filter((item) => {
      const isSelected = Boolean(selectedBySlot[activeCategory]?.includes(item.product.id));
      if (compatibleOnly && !item.evalResult.compatible && !isSelected) {
        hiddenIncompatibleCount += 1;
        return false;
      }
      return true;
    });

    finalItems.sort((a, b) => {
      if (sortBy === 'price-asc') return (a.product.price ?? 0) - (b.product.price ?? 0);
      if (sortBy === 'price-desc') return (b.product.price ?? 0) - (a.product.price ?? 0);
      if (sortBy === 'name-asc') return a.product.name.localeCompare(b.product.name);
      if (sortBy === 'name-desc') return b.product.name.localeCompare(a.product.name);
      return 0;
    });

    return { items: finalItems, hiddenIncompatibleCount };
  }, [
    productsByCategory,
    activeCategory,
    categorySearch,
    sortBy,
    selectedBrand,
    inStockOnly,
    stockByProduct,
    resolvedBuild.record,
    compatibility,
    compatibleOnly,
    selectedBySlot,
  ]);

  const compareDiff = useMemo(
    () => diffBuildSnapshots(snapshotA ?? {}, selectedBySlot, products),
    [snapshotA, selectedBySlot, products]
  );

  const renderCategoryBrowser = () => (
    <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3.5">
      {/* Category Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-md bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-amber-700 dark:text-amber-400 shrink-0">
            {getCategoryIcon(activeCategory, 'w-4 h-4')}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-zinc-950 dark:text-zinc-50 text-sm sm:text-base flex flex-wrap items-center gap-2">
              <span>{activeCategory} Catalog</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 tabular-nums">
                {categoryFilterResult.items.length} shown
              </span>
              {MULTI_SLOT_CATEGORIES.has(activeCategory) && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                  Multi-slot
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 truncate">
              {MULTI_SLOT_CATEGORIES.has(activeCategory)
                ? `Add multiple ${activeCategory.toLowerCase()} components into your build.`
                : `Select a component to seat directly in the ${activeCategory} bay.`}
            </p>
          </div>
        </div>

        {!isDesktop && MULTI_SLOT_CATEGORIES.has(activeCategory) && (
          <button
            type="button"
            onClick={() => setMobilePickerOpen(false)}
            className="px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-semibold cursor-pointer"
          >
            Done
          </button>
        )}
      </div>

      {/* Slot Quick Pills */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_WORKBENCH_SLOTS.map((slot) => {
          const active = activeCategory === slot;
          const count = selectedBySlot[slot]?.length ?? 0;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => {
                setActiveCategory(slot);
                setCategorySearch('');
                setSelectedBrand('All');
              }}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                active
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                  : count > 0
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  : 'bg-zinc-50 dark:bg-carbon-elevated border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
              }`}
            >
              <span>{slot}</span>
              {count > 0 && <span className="font-mono text-[10px] tabular-nums">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Search & Smart Compatibility Controls */}
      <div className="space-y-2">
        <div className="relative">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="search"
            placeholder={`Search ${activeCategory} by name, brand, SKU, or socket...`}
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded-md text-xs text-zinc-950 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:border-amber-600 focus:bg-white dark:focus:bg-zinc-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="compatible-only-toggle"
            aria-pressed={compatibleOnly}
            onClick={() => setCompatibleOnly((v) => !v)}
            className={`px-2.5 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              compatibleOnly
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-zinc-50 dark:bg-carbon-elevated border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <Filter className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Compatible Only</span>
            {categoryFilterResult.hiddenIncompatibleCount > 0 && (
              <span className="font-mono text-[10px] opacity-80">
                ({categoryFilterResult.hiddenIncompatibleCount} hidden)
              </span>
            )}
          </button>

          {activeCategoryBrands.length > 1 && (
            <select
              aria-label="Filter by brand"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded-md text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-600 cursor-pointer"
            >
              <option value="All">All Brands</option>
              {activeCategoryBrands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Sort products"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-2.5 py-1.5 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded-md text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-600 cursor-pointer"
          >
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
          </select>

          <button
            type="button"
            aria-pressed={inStockOnly}
            onClick={() => setInStockOnly((v) => !v)}
            className={`px-2.5 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
              inStockOnly
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300'
                : 'bg-zinc-50 dark:bg-carbon-elevated border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            In Stock
          </button>
        </div>
      </div>

      {/* Component Rows */}
      <div className={`space-y-2.5 ${isDesktop ? 'max-h-[720px] overflow-y-auto pr-1' : ''}`}>
        {categoryFilterResult.items.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-carbon-elevated space-y-2.5">
            <PackageOpen className="w-7 h-7 mx-auto text-zinc-400" strokeWidth={1.5} />
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              No {activeCategory} components match the active filters.
            </div>
            {compatibleOnly && categoryFilterResult.hiddenIncompatibleCount > 0 && (
              <button
                type="button"
                onClick={() => setCompatibleOnly(false)}
                className="px-3 py-1.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:border-amber-500 cursor-pointer"
              >
                Show all ({categoryFilterResult.hiddenIncompatibleCount} incompatible hidden)
              </button>
            )}
          </div>
        ) : (
          categoryFilterResult.items.map(({ product, evalResult }) => {
            const isSelected = Boolean(selectedBySlot[activeCategory]?.includes(product.id));
            const stock = stockByProduct.get(product.id) ?? 0;
            const isOutOfStock = stock <= 0;

            return (
              <div
                key={product.id}
                className={`p-3 rounded-lg border transition-all flex flex-col gap-2.5 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
                    : evalResult.severity === 'error'
                    ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/15'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-carbon-elevated hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 shrink-0 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-100 overflow-hidden flex items-center justify-center">
                    <ProductImage
                      imageUrl={product.imageUrl}
                      sku={product.sku}
                      name={product.name}
                      category={activeCategory}
                      className="w-full h-full object-contain p-1"
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                        {product.name}
                      </h3>
                      <span className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 font-mono tabular-nums shrink-0">
                        {formatCurrency(product.price || 0, currencySymbol)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {product.brand && (
                        <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                          {product.brand}
                        </span>
                      )}
                      {product.specs?.socket && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono border border-zinc-200 dark:border-zinc-700">
                          {product.specs.socket}
                        </span>
                      )}
                      {product.specs?.ramType && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono border border-zinc-200 dark:border-zinc-700">
                          {product.specs.ramType}
                        </span>
                      )}
                      {product.specs?.formFactor && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono border border-zinc-200 dark:border-zinc-700">
                          {product.specs.formFactor}
                        </span>
                      )}
                      {product.specs?.wattage ? (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono border border-zinc-200 dark:border-zinc-700 tabular-nums">
                          {product.specs.wattage}W
                        </span>
                      ) : null}
                      <span
                        className={`font-mono tabular-nums ${
                          isOutOfStock
                            ? 'text-rose-700 dark:text-rose-400 font-medium'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        ({stock} in stock)
                      </span>
                    </div>

                    {evalResult.reasons.length > 0 && (
                      <div
                        className={`text-[11px] font-medium flex items-center gap-1.5 pt-0.5 ${
                          evalResult.severity === 'error'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {evalResult.severity === 'error' ? (
                          <XCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                        )}
                        <span>{evalResult.reasons[0]}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  {isSelected ? (
                    <button
                      type="button"
                      onClick={() => handleRemovePart(activeCategory, product.id)}
                      className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2} />
                      <span>Installed</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelectPart(activeCategory, product.id)}
                      className="px-3 py-1.5 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <span>Install Part</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <StorefrontShell
      storeId={storeId}
      currencySymbol={currencySymbol}
      cartState={cartState}
      activeNav="builder"
      onNavigateHome={onBack}
      onNavigateBuilder={() => {}}
    >
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4 flex-1">
        {/* Top Builder Toolbar */}
        <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-md bg-zinc-50 dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white cursor-pointer shrink-0"
              aria-label="Back to catalog"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Custom PC Rig Builder
              </h1>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Click any hardware zone inside the CAD chassis to browse compatible components in real time.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleApplyPreset('am5-1440p')}
              data-testid="preset-am5-btn"
              className="px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/70 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
              <span>AM5 Gaming</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('budget-am4')}
              className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>Budget AM4</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('rtx5080-flagship')}
              className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>RTX 5080 Flagship</span>
            </button>

            <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />

            <button
              type="button"
              onClick={handleSaveSnapshotA}
              className="px-2.5 py-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {snapshotSavedFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Saved Build A</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  <span>{snapshotA ? 'Update Build A' : 'Save Build A'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="compare-builds-btn"
              onClick={() => setCompareModalOpen(true)}
              className="px-2.5 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <GitCompare className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Compare A vs B</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedBySlot({})}
              className="p-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white cursor-pointer transition-colors"
              title="Reset Build"
              aria-label="Reset Build"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Target Budget & Auto-Fill Bar */}
        <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <label
                htmlFor="builder-budget"
                className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Target Budget ({currencySymbol})</span>
              </label>
              <input
                id="builder-budget"
                type="number"
                min={0}
                step={5000}
                value={targetBudgetInput}
                onChange={(e) => setTargetBudgetInput(e.target.value)}
                className="w-32 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded-md px-2.5 py-1 text-xs font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums focus:outline-none focus:border-amber-600"
              />
              <div className="flex flex-wrap items-center gap-1">
                {QUICK_BUDGETS.map((amt) => {
                  const active = parsedTargetBudget === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTargetBudgetInput(String(amt))}
                      className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer border transition-colors ${
                        active
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
                          : 'bg-zinc-50 dark:bg-carbon-elevated border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
                      }`}
                    >
                      {currencySymbol}
                      {Math.round(amt / 1000)}k
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {parsedTargetBudget > 0 && (
                <span
                  className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md border tabular-nums ${
                    budgetBreakdown.overBudget
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {budgetBreakdown.overBudget
                    ? `${formatCurrency(Math.abs(budgetBreakdown.delta), currencySymbol)} over`
                    : `${formatCurrency(budgetBreakdown.delta, currencySymbol)} remaining`}
                </span>
              )}

              <button
                type="button"
                data-testid="auto-fill-build-btn"
                onClick={handleAutoFill}
                className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Complete My Build</span>
              </button>
            </div>
          </div>

          {/* Segmented Budget Allocation Bar */}
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex">
              {budgetBreakdown.gpuPct > 0 && (
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${budgetBreakdown.gpuPct}%` }}
                  title={`GPU: ${formatCurrency(budgetBreakdown.gpu, currencySymbol)}`}
                />
              )}
              {budgetBreakdown.cpuPct > 0 && (
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${budgetBreakdown.cpuPct}%` }}
                  title={`CPU: ${formatCurrency(budgetBreakdown.cpu, currencySymbol)}`}
                />
              )}
              {budgetBreakdown.platformPct > 0 && (
                <div
                  className="bg-sky-500 h-full transition-all"
                  style={{ width: `${budgetBreakdown.platformPct}%` }}
                  title={`Motherboard & RAM: ${formatCurrency(budgetBreakdown.platform, currencySymbol)}`}
                />
              )}
              {budgetBreakdown.otherPct > 0 && (
                <div
                  className="bg-zinc-500 dark:bg-zinc-400 h-full transition-all"
                  style={{ width: `${budgetBreakdown.otherPct}%` }}
                  title={`Other Components: ${formatCurrency(budgetBreakdown.other, currencySymbol)}`}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                GPU {formatCurrency(budgetBreakdown.gpu, currencySymbol)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                CPU {formatCurrency(budgetBreakdown.cpu, currencySymbol)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                Platform {formatCurrency(budgetBreakdown.platform, currencySymbol)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-500 dark:bg-zinc-400" />
                Chassis / Power / Drives {formatCurrency(budgetBreakdown.other, currencySymbol)}
              </span>
            </div>
          </div>
        </div>

        {/* Split Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: CAD Workbench / Manifest + Compatibility + Totals */}
          <div className="lg:col-span-7 space-y-4">
            {/* View Mode Toggle + Mobile Browse Trigger */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-carbon p-0.5">
                <button
                  type="button"
                  onClick={() => setLeftView('workbench')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    leftView === 'workbench'
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>CAD Workbench</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLeftView('manifest')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    leftView === 'manifest'
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Parts Manifest ({resolvedBuild.list.length})</span>
                </button>
              </div>

              {!isDesktop && (
                <button
                  type="button"
                  onClick={() => setMobilePickerOpen(true)}
                  className="px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {getCategoryIcon(activeCategory, 'w-3.5 h-3.5')}
                  <span>Browse {activeCategory} Parts</span>
                </button>
              )}
            </div>

            {leftView === 'workbench' ? (
              <PcRigWorkbench
                selectedParts={resolvedBuild.record}
                activeCategory={activeCategory}
                onSelectCategory={handleSelectRigZone}
                onRemovePart={handleRemovePart}
                compatibility={compatibility}
                currencySymbol={currencySymbol}
                viewMode={workbenchViewMode}
                onChangeViewMode={setWorkbenchViewMode}
              />
            ) : (
              <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200 dark:divide-zinc-800">
                {ALL_WORKBENCH_SLOTS.map((slot) => {
                  const slotIds = selectedBySlot[slot] || [];
                  const slotProducts = slotIds
                    .map((id) => products.find((p) => p.id === id))
                    .filter((p): p is ProductLocal => Boolean(p));

                  return (
                    <div key={slot} className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          <span className="text-amber-700 dark:text-amber-400">
                            {getCategoryIcon(slot, 'w-4 h-4')}
                          </span>
                          <span>{slot}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectRigZone(slot)}
                          className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          {slotProducts.length > 0 ? 'Swap / Add' : `Choose ${slot}`}
                        </button>
                      </div>

                      {slotProducts.length > 0 ? (
                        <div className="space-y-1.5">
                          {slotProducts.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 p-2"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-10 h-10 rounded bg-white dark:bg-zinc-100 border border-zinc-200 dark:border-zinc-700 shrink-0 overflow-hidden">
                                  <ProductImage
                                    imageUrl={item.imageUrl}
                                    sku={item.sku}
                                    name={item.name}
                                    category={slot}
                                    className="w-full h-full object-contain p-0.5"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 truncate">
                                    {item.name}
                                  </div>
                                  <div className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                                    {formatCurrency(item.price || 0, currencySymbol)}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemovePart(slot, item.id)}
                                aria-label={`Remove ${item.name}`}
                                className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                          No {slot.toLowerCase()} selected
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Compatibility & Wattage Summary Box */}
            <div
              data-testid="compatibility-status-box"
              className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                compatibility.isCompatible
                  ? 'bg-white dark:bg-carbon border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 font-semibold">
                  {compatibility.isCompatible ? (
                    <>
                      <CheckCircle2
                        className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                        strokeWidth={1.75}
                      />
                      <span className="text-zinc-950 dark:text-zinc-50">
                        Compatibility Verified
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle
                        className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0"
                        strokeWidth={1.75}
                      />
                      <span>Compatibility Conflict</span>
                    </>
                  )}
                </div>
                <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {compatibility.estimatedSystemWatts}W load - Rec. {compatibility.recommendedPsuWatts}W+
                </span>
              </div>

              {compatibility.errors.map((err, i) => (
                <p key={i} className="text-[11px] text-rose-800 dark:text-rose-300 leading-relaxed">
                  - {err}
                </p>
              ))}

              {compatibility.warnings.map((warn, i) => (
                <p key={i} className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  - {warn}
                </p>
              ))}

              {compatibility.isCompatible && compatibility.errors.length === 0 && (
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Socket standards, memory type, and PSU headroom align.
                </p>
              )}

              {compatibility.selectedPsuWatts !== null && (
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400">
                  <span>Selected PSU Capacity</span>
                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-100 tabular-nums">
                    {compatibility.selectedPsuWatts}W
                  </span>
                </div>
              )}
            </div>

            {/* Totals & Checkout Actions */}
            <div className="p-4 rounded-xl bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="builder-client"
                    className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    Build / Client Name
                  </label>
                  <input
                    id="builder-client"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-amber-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="builder-discount"
                    className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    Bundle Discount ({currencySymbol})
                  </label>
                  <input
                    id="builder-discount"
                    type="number"
                    min={0}
                    value={bundleDiscount}
                    onChange={(e) => setBundleDiscount(e.target.value)}
                    className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1 text-xs">
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Parts Subtotal ({resolvedBuild.list.length})</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(subtotal, currencySymbol)}
                  </span>
                </div>
                {discountNum > 0 && (
                  <div className="flex justify-between text-amber-800 dark:text-amber-400 font-medium">
                    <span>Bundle Discount</span>
                    <span className="font-mono tabular-nums">
                      -{formatCurrency(discountNum, currencySymbol)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">Build Total</span>
                  <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 font-mono tabular-nums">
                    {formatCurrency(totalAmount, currencySymbol)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={resolvedBuild.list.length === 0}
                  onClick={handleAddBuildToCart}
                  data-testid="load-build-to-cart-btn"
                  className="w-full py-2.5 px-3 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 text-white dark:text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" strokeWidth={1.75} />
                  <span>Add Rig to Order Cart</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={resolvedBuild.list.length === 0}
                    onClick={handleOpenQuote}
                    data-testid="generate-quote-btn"
                    className="w-full py-2 px-2.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 text-zinc-800 dark:text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors border border-zinc-300 dark:border-zinc-700"
                  >
                    <FileText
                      className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0"
                      strokeWidth={1.75}
                    />
                    <span>Printable Quote</span>
                  </button>

                  <button
                    type="button"
                    disabled={resolvedBuild.list.length === 0}
                    onClick={handleCopyBuildList}
                    className="w-full py-2 px-2.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 text-zinc-800 dark:text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors border border-zinc-300 dark:border-zinc-700"
                  >
                    {copiedBuild ? (
                      <>
                        <Check
                          className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
                          strokeWidth={1.75}
                        />
                        <span className="text-emerald-800 dark:text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" strokeWidth={1.75} />
                        <span>Copy Spec Sheet</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Single-Mounted Inline Category Browser on Desktop */}
          {isDesktop && (
            <div id="builder-picker" className="lg:col-span-5 lg:sticky lg:top-20">
              {renderCategoryBrowser()}
            </div>
          )}
        </div>
      </main>

      {/* Mobile Slide-Over / Modal Category Picker when < lg */}
      {!isDesktop && (
        <ModalDialog
          open={mobilePickerOpen}
          onClose={() => setMobilePickerOpen(false)}
          title={`Select ${activeCategory}`}
          subtitle="Tap Install Part to place this component into your build."
          maxWidth="2xl"
        >
          {renderCategoryBrowser()}
        </ModalDialog>
      )}

      {/* Multi-Build A/B Snapshot Compare Modal */}
      <ModalDialog
        open={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        title="Compare Builds (Snapshot A vs Current B)"
        subtitle="Side-by-side part delta, budget impact, and power draw variance."
        maxWidth="4xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveSnapshotA}
                className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-amber-500 cursor-pointer inline-flex items-center gap-1.5"
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Save Current as Snapshot A</span>
              </button>
              <button
                type="button"
                onClick={handleSwapSnapshots}
                className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:border-amber-500 cursor-pointer inline-flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Swap A &lt;-&gt; B</span>
              </button>
              {snapshotA && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBySlot(cloneSlotMap(snapshotA));
                    setCompareModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-semibold cursor-pointer"
                >
                  Restore Build A as Current
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
                Snapshot A Total
              </div>
              <div className="text-base font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatCurrency(compareDiff.totalA, currencySymbol)}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                {compareDiff.wattageA}W load
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
                Current Build B Total
              </div>
              <div className="text-base font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatCurrency(compareDiff.totalB, currencySymbol)}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                {compareDiff.wattageB}W load
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
                Net Variance (B - A)
              </div>
              <div
                className={`text-base font-mono font-semibold tabular-nums mt-0.5 ${
                  compareDiff.priceDelta > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : compareDiff.priceDelta < 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-zinc-700 dark:text-zinc-300'
                }`}
              >
                {compareDiff.priceDelta >= 0 ? '+' : '-'}
                {formatCurrency(Math.abs(compareDiff.priceDelta), currencySymbol)}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                {compareDiff.wattageDelta >= 0 ? '+' : ''}
                {compareDiff.wattageDelta}W difference
              </div>
            </div>
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
              {compareDiff.rows.map((row) => (
                <div
                  key={row.slot}
                  className={`grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 items-center ${
                    row.status === 'changed'
                      ? 'bg-amber-50/40 dark:bg-amber-950/20'
                      : row.status === 'added'
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                      : row.status === 'removed'
                      ? 'bg-rose-50/40 dark:bg-rose-950/20'
                      : 'bg-white dark:bg-carbon'
                  }`}
                >
                  <div className="sm:col-span-2 font-mono font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <span>{row.slot}</span>
                    {row.status !== 'same' && (
                      <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                        {row.status}
                      </span>
                    )}
                  </div>
                  <div className="sm:col-span-5 text-zinc-700 dark:text-zinc-300 truncate">
                    {row.partsA.length > 0
                      ? `${row.partsA.map((p) => p.name).join(', ')} (${formatCurrency(
                          row.priceA,
                          currencySymbol
                        )})`
                      : 'Empty'}
                  </div>
                  <div className="sm:col-span-5 text-zinc-950 dark:text-zinc-100 font-medium truncate">
                    {row.partsB.length > 0
                      ? `${row.partsB.map((p) => p.name).join(', ')} (${formatCurrency(
                          row.priceB,
                          currencySymbol
                        )})`
                      : 'Empty'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ModalDialog>

      <ReceiptQuoteModal
        open={Boolean(activeQuote)}
        onClose={() => setActiveQuote(null)}
        storeName={storeName}
        currencySymbol={currencySymbol}
        quote={activeQuote}
      />
    </StorefrontShell>
  );
}
