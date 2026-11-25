import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb } from '../db/index.js';
import { ProductImage } from '../components/ProductImage.js';
import { StorefrontShell } from '../components/StorefrontShell.js';
import { useCustomerCart } from '../hooks/useCustomerCart.js';
import { buildStockMap } from '../services/publicCatalogSync.js';
import {
  HardwareCategory,
  HARDWARE_CATEGORIES,
  formatCurrency,
} from '@countwise/shared';
import {
  Plus,
  Sparkles,
  Zap,
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
  X,
} from 'lucide-react';

interface StorefrontPageProps {
  storeId: string;
  currencySymbol?: string;
  onOpenPcBuilder?: () => void;
  onSwitchToStaff?: () => void;
  onSelectProduct?: (productId: string) => void;
  onResolvePublicStoreId?: (resolvedStoreId: string) => void;
}

const CATEGORY_ICONS: Record<HardwareCategory, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
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

const QUICK_CATEGORIES: HardwareCategory[] = [
  'CPU',
  'GPU',
  'Motherboard',
  'RAM',
  'Storage',
  'Laptop',
];

const FEATURED_SHOWCASE = [
  {
    sku: 'CPU-AMD-9800X3D',
    label: 'Ryzen 7 9800X3D',
    category: 'CPU' as HardwareCategory,
    imageUrl: '/images/products/CPU-AMD-9800X3D.webp',
  },
  {
    sku: 'GPU-ASUS-5080',
    label: 'RTX 5080 TUF OC',
    category: 'GPU' as HardwareCategory,
    imageUrl: '/images/products/GPU-ASUS-5080.webp',
  },
  {
    sku: 'MB-ASUS-B650A',
    label: 'ROG Strix B650-A',
    category: 'Motherboard' as HardwareCategory,
    imageUrl: '/images/products/MB-ASUS-B650A.webp',
  },
];

export function StorefrontPage({
  storeId,
  currencySymbol = '₱',
  onOpenPcBuilder,
  onSelectProduct,
}: StorefrontPageProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HardwareCategory | 'All'>('All');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedCompatTag, setSelectedCompatTag] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'name'>('featured');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

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

  const stockMap = useMemo(() => buildStockMap(products, adjustments), [products, adjustments]);

  const availableBrands = useMemo(() => {
    const byLower = new Map<string, string>();
    for (const p of products) {
      const trimmed = p.brand?.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const existing = byLower.get(key);
      if (!existing) {
        byLower.set(key, trimmed);
      } else {
        const existingAllCaps = existing === existing.toUpperCase();
        const candidateAllCaps = trimmed === trimmed.toUpperCase();
        const existingCaps = (existing.match(/[A-Z]/g) || []).length;
        const candidateCaps = (trimmed.match(/[A-Z]/g) || []).length;
        if (existingAllCaps && !candidateAllCaps) {
          byLower.set(key, trimmed);
        } else if (!existingAllCaps && !candidateAllCaps && candidateCaps > existingCaps) {
          byLower.set(key, trimmed);
        }
      }
    }
    return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b));
  }, [products]);

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
        return 0;
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

  const handleSelectShowcase = (sku: string, category: HardwareCategory) => {
    const match = products.find((p) => p.sku?.toUpperCase() === sku.toUpperCase());
    if (match && onSelectProduct) {
      onSelectProduct(match.id);
    } else {
      setSelectedCategory(category);
    }
  };

  const renderCatalogSidebar = () => (
    <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800">
      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
            <span>Categories</span>
          </h2>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.75} />
              <span>Reset</span>
            </button>
          )}
        </div>

        <nav className="space-y-0.5" aria-label="Hardware categories">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold'
                : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
            }`}
          >
            <span className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span>All PC Hardware</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                selectedCategory === 'All'
                  ? 'bg-zinc-800 dark:bg-zinc-200 text-zinc-200 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-carbon-elevated text-zinc-600 dark:text-zinc-400'
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
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-amber-400 dark:text-amber-600' : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                    strokeWidth={1.75}
                  />
                  <span className="truncate">{cat}</span>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums shrink-0 ${
                    isSelected
                      ? 'bg-zinc-800 dark:bg-zinc-200 text-zinc-200 dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-carbon-elevated text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">In-Stock Only</div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-400">Hide backorder items</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="In-Stock Only"
            aria-checked={inStockOnly}
            onClick={() => setInStockOnly((v) => !v)}
            className={`w-10 h-5.5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
              inStockOnly ? 'bg-amber-600' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <div
              className={`w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform ${
                inStockOnly ? 'translate-x-4.5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Platform &amp; Memory</div>
          <div className="grid grid-cols-2 gap-1.5">
            {COMPATIBILITY_TAGS.map((tag) => {
              const active = selectedCompatTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedCompatTag(active ? null : tag)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium border transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-amber-900 dark:text-amber-300 font-semibold'
                      : 'bg-zinc-50 dark:bg-carbon-elevated border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {availableBrands.length > 0 && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Brand ({availableBrands.length})
              </div>
              {selectedBrand && (
                <button
                  type="button"
                  onClick={() => setSelectedBrand(null)}
                  className="text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-800 font-medium cursor-pointer"
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
                    className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                      active
                        ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                        : 'bg-zinc-50 dark:bg-carbon-elevated border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white'
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

      {onOpenPcBuilder && (
        <div className="p-4 space-y-2.5 bg-zinc-50/70 dark:bg-carbon-elevated/60 rounded-b-lg">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-950 dark:text-zinc-50">
            <Wrench className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" strokeWidth={1.75} />
            <span>Custom PC Rig Builder</span>
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Check AM5 or LGA1700 socket fit, DDR5 memory type, and PSU wattage before ordering.
          </p>
          <button
            type="button"
            onClick={onOpenPcBuilder}
            className="w-full py-2 px-3 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Open Rig Builder</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <StorefrontShell
      storeId={storeId}
      currencySymbol={currencySymbol}
      cartState={cartState}
      activeNav="catalog"
      searchValue={search}
      onSearchChange={setSearch}
      onNavigateHome={resetAllFilters}
      onNavigateBuilder={() => onOpenPcBuilder?.()}
    >
      {/* Compact Catalog-Forward Intro */}
      <section className="bg-white dark:bg-carbon border-b border-zinc-200 dark:border-zinc-800 py-5 sm:py-7 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-3">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight">
              PC Hardware, In Stock in Gilmore
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-[58ch] leading-relaxed">
              Processors, graphics cards, motherboards, DDR5 memory, and custom builds ready for
              pickup or delivery.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onOpenPcBuilder && (
                <button
                  type="button"
                  onClick={onOpenPcBuilder}
                  className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] text-white dark:text-zinc-950 font-semibold text-xs inline-flex items-center gap-2 whitespace-nowrap transition cursor-pointer"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600" strokeWidth={1.75} />
                  <span>Build a Custom PC</span>
                </button>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_CATEGORIES.map((cat) => {
                  const active = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(active ? 'All' : cat)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-amber-900 dark:text-amber-300 font-semibold'
                          : 'bg-zinc-50 dark:bg-carbon-elevated border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-3 gap-2.5">
            {FEATURED_SHOWCASE.map((item) => (
              <button
                key={item.sku}
                type="button"
                onClick={() => handleSelectShowcase(item.sku, item.category)}
                className="group text-left bg-zinc-50 dark:bg-carbon-elevated hover:bg-white dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-lg p-2.5 transition-colors cursor-pointer"
              >
                <div className="aspect-square bg-white dark:bg-zinc-100 rounded border border-zinc-200 dark:border-zinc-700/80 p-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={item.imageUrl}
                    alt={item.label}
                    decoding="async"
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-150"
                  />
                </div>
                <div className="mt-2">
                  <div className="text-[11px] font-medium text-amber-800 dark:text-amber-400">{item.category}</div>
                  <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 truncate">{item.label}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Catalog */}
      <main id="catalog" className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6 items-start">
          <aside className="hidden lg:block sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            {renderCatalogSidebar()}
          </aside>

          <div className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-carbon px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <button
                  type="button"
                  onClick={() => setIsMobileFiltersOpen((v) => !v)}
                  className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium text-xs cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                  <span>Filters</span>
                </button>

                <span className="tabular-nums">
                  Showing <strong className="text-zinc-950 dark:text-zinc-50 font-semibold">{filteredProducts.length}</strong> of{' '}
                  {products.length} components
                </span>

                {selectedCategory !== 'All' && (
                  <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-300 font-medium inline-flex items-center gap-1">
                    {selectedCategory}
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('All')}
                      aria-label={`Remove ${selectedCategory} filter`}
                      className="hover:text-zinc-950 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </span>
                )}

                {selectedBrand && (
                  <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium inline-flex items-center gap-1">
                    {selectedBrand}
                    <button
                      type="button"
                      onClick={() => setSelectedBrand(null)}
                      aria-label={`Remove ${selectedBrand} filter`}
                      className="hover:text-zinc-950 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </span>
                )}

                {selectedCompatTag && (
                  <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono font-medium inline-flex items-center gap-1">
                    {selectedCompatTag}
                    <button
                      type="button"
                      onClick={() => setSelectedCompatTag(null)}
                      aria-label={`Remove ${selectedCompatTag} filter`}
                      className="hover:text-zinc-950 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="catalog-sort" className="text-xs text-zinc-600 dark:text-zinc-400">
                  Sort:
                </label>
                <select
                  id="catalog-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-600 cursor-pointer"
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name">Name (A-Z)</option>
                </select>
              </div>
            </div>

            {isMobileFiltersOpen && <div className="lg:hidden">{renderCatalogSidebar()}</div>}

            {filteredProducts.length === 0 ? (
              <div className="p-10 text-center rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-3">
                <Package className="w-10 h-10 text-zinc-400 mx-auto" strokeWidth={1.5} />
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  No components match your filters
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
                  Reset your category, brand, or socket filters to view the full hardware catalog.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold rounded-md text-xs transition-colors cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProducts.map((product) => {
                  const stock = stockMap.get(product.id) ?? 0;
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock <= 3;

                  return (
                    <article
                      key={product.id}
                      onClick={() => onSelectProduct?.(product.id)}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-carbon p-4 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors group cursor-pointer"
                    >
                      <div className="space-y-3">
                        <ProductImage
                          imageUrl={product.imageUrl}
                          sku={product.sku}
                          name={product.name}
                          category={product.category}
                          className="w-full h-44"
                        />

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-zinc-600 dark:text-zinc-400 font-medium truncate">
                              <span className="text-amber-800 dark:text-amber-400">{product.category}</span>
                              {product.brand && ` · ${product.brand}`}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border tabular-nums shrink-0 ${
                                isOutOfStock
                                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/70'
                                  : isLowStock
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800/70'
                                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                              }`}
                            >
                              {isOutOfStock
                                ? 'Backorder'
                                : isLowStock
                                ? `${stock} left`
                                : `${stock} in stock`}
                            </span>
                          </div>

                          <h3 className="font-semibold text-zinc-950 dark:text-zinc-50 text-sm line-clamp-2 leading-snug group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors">
                            {product.name}
                          </h3>

                          {product.specs && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {product.specs.socket && (
                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 text-[10px] font-mono border border-zinc-200 dark:border-zinc-700">
                                  {product.specs.socket}
                                </span>
                              )}
                              {product.specs.ramType && (
                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 text-[10px] font-mono border border-zinc-200 dark:border-zinc-700">
                                  {product.specs.ramType}
                                </span>
                              )}
                              {product.specs.formFactor && (
                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 text-[10px] font-mono border border-zinc-200 dark:border-zinc-700">
                                  {product.specs.formFactor}
                                </span>
                              )}
                              {product.specs.wattage ? (
                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 text-[10px] font-mono border border-zinc-200 dark:border-zinc-700 tabular-nums">
                                  {product.specs.wattage}W
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-zinc-950 dark:text-zinc-50 font-mono tabular-nums">
                            {formatCurrency(product.price ?? 0, currencySymbol)}
                          </div>
                          {product.warranty && (
                            <div className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate max-w-[125px]">
                              {product.warranty}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cartState.addToCart(product, 1);
                          }}
                          className="px-3 py-1.5 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.98] text-white dark:text-zinc-950 font-medium text-xs inline-flex items-center gap-1 whitespace-nowrap transition cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Add to Cart</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </StorefrontShell>
  );
}
