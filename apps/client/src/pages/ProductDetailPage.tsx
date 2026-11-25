import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb } from '../db/index.js';
import { ProductImage } from '../components/ProductImage.js';
import { StorefrontShell } from '../components/StorefrontShell.js';
import { useCustomerCart } from '../hooks/useCustomerCart.js';
import { buildStockMap } from '../services/publicCatalogSync.js';
import { formatCurrency } from '@countwise/shared';
import {
  ShoppingCart,
  Plus,
  Minus,
  ShieldCheck,
  Zap,
  ArrowRight,
  ArrowLeft,
  Package,
  Check,
  Cpu,
  Layers,
} from 'lucide-react';

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
  onOpenPcBuilder,
}: ProductDetailPageProps) {
  const [quantity, setQuantity] = useState(1);
  const [search, setSearch] = useState('');
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

  const product = useMemo(() => {
    return products.find((p) => p.id === productId) || null;
  }, [products, productId]);

  const stockMap = useMemo(() => buildStockMap(products, adjustments), [products, adjustments]);

  const currentStock = product ? stockMap.get(product.id) ?? 0 : 0;
  const isOutOfStock = currentStock <= 0;
  const isLowStock = currentStock > 0 && currentStock <= 3;

  const relatedProducts = useMemo(() => {
    if (!product) return [];
    return products
      .filter((p) => p.id !== product.id && p.category === product.category)
      .slice(0, 4);
  }, [products, product]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      onBack();
    }
  };

  if (!product) {
    return (
      <StorefrontShell
        storeId={storeId}
        currencySymbol={currencySymbol}
        cartState={cartState}
        activeNav="catalog"
        onNavigateHome={onBack}
        onNavigateBuilder={() => onOpenPcBuilder?.()}
      >
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Package className="w-12 h-12 text-zinc-400 dark:text-zinc-600 mb-3" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 mb-1">Product Not Found</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mb-5">
            This hardware item could not be found or is no longer active in the catalog.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-xs inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            <span>Return to Catalog</span>
          </button>
        </div>
      </StorefrontShell>
    );
  }

  return (
    <StorefrontShell
      storeId={storeId}
      currencySymbol={currencySymbol}
      cartState={cartState}
      activeNav="catalog"
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={handleSearchSubmit}
      onNavigateHome={onBack}
      onNavigateBuilder={() => onOpenPcBuilder?.()}
    >
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8 flex-1">
        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-3.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white font-medium cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
              <span>Catalog</span>
            </button>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span className="text-amber-800 dark:text-amber-400 font-medium shrink-0">{product.category}</span>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span className="text-zinc-950 dark:text-zinc-50 font-medium truncate">{product.name}</span>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Back to Catalog</span>
          </button>
        </div>

        {/* 2-Column Product Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 sm:p-6">
            <ProductImage
              imageUrl={product.imageUrl}
              sku={product.sku}
              name={product.name}
              category={product.category}
              className="w-full h-64 sm:h-80 lg:h-[400px]"
            />
          </div>

          <div className="lg:col-span-6 space-y-5">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  <span className="text-amber-800 dark:text-amber-400 font-semibold uppercase">{product.category}</span>
                  {product.brand && <span>· {product.brand}</span>}
                  {product.sku && <span>· SKU: {product.sku}</span>}
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium border tabular-nums ${
                    isOutOfStock
                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/70'
                      : isLowStock
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800/70'
                      : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                  }`}
                >
                  {isOutOfStock
                    ? 'Out of Stock / Backorder'
                    : isLowStock
                    ? `Only ${currentStock} left`
                    : `In Stock (${currentStock} units)`}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 leading-snug">
                {product.name}
              </h1>

              {product.warranty && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 text-xs border border-zinc-200 dark:border-zinc-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                  <span>{product.warranty}</span>
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
              <div className="text-xs text-zinc-600 dark:text-zinc-400">Retail Price (12% VAT Inclusive)</div>
              <div className="text-2xl sm:text-3xl font-semibold text-zinc-950 dark:text-zinc-50 font-mono tabular-nums tracking-tight">
                {formatCurrency(product.price ?? 0, currencySymbol)}
              </div>
            </div>

            {product.specs &&
              (product.specs.socket || product.specs.ramType || product.specs.wattage || product.specs.formFactor) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {product.specs.socket && (
                    <div className="p-3 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 text-xs">
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                        <span>Socket</span>
                      </div>
                      <div className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 mt-0.5">
                        {product.specs.socket}
                      </div>
                    </div>
                  )}

                  {product.specs.ramType && (
                    <div className="p-3 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 text-xs">
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                        <span>Memory Type</span>
                      </div>
                      <div className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 mt-0.5">
                        {product.specs.ramType}
                      </div>
                    </div>
                  )}

                  {product.specs.wattage ? (
                    <div className="p-3 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 text-xs">
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                        <span>Power / TDP</span>
                      </div>
                      <div className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                        {product.specs.wattage}W
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

            <div className="p-4 sm:p-5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Quantity</span>
                <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 rounded-md p-0.5">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                    className="p-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                  <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 px-3 tabular-nums">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    aria-label="Increase quantity"
                    className="p-1.5 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => cartState.addToCart(product, quantity)}
                  className="py-2.5 px-4 rounded-md bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 active:scale-[0.99] border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-semibold text-xs inline-flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                  <span>Add to Cart</span>
                </button>

                <button
                  type="button"
                  onClick={() => cartState.buyNow(product, quantity)}
                  className="py-2.5 px-4 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] text-white dark:text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <span>Buy Now</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600 dark:text-zinc-400 pt-2.5 border-t border-zinc-200 dark:border-zinc-800">
                <span className="inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" strokeWidth={1.75} />
                  <span>Live store stock synced</span>
                </span>
                <span>Gilmore pickup or Metro Manila courier</span>
              </div>
            </div>
          </div>
        </div>

        {/* Grouped Hardware Specs Cards (no repetitive hairline rows) */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Technical Specifications</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
              <div className="text-zinc-600 dark:text-zinc-400">Category &amp; Brand</div>
              <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                {product.category} · {product.brand || 'Original Distro'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
              <div className="text-zinc-600 dark:text-zinc-400">SKU Reference</div>
              <div className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">{product.sku || 'N/A'}</div>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
              <div className="text-zinc-600 dark:text-zinc-400">Warranty Coverage</div>
              <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                {product.warranty || '1 Year Store Warranty'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
              <div className="text-zinc-600 dark:text-zinc-400">Gilmore Branch Stock</div>
              <div className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                {currentStock} Units
              </div>
            </div>

            {product.specs?.socket && (
              <div className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="text-zinc-600 dark:text-zinc-400">CPU Socket Platform</div>
                <div className="font-mono font-semibold text-amber-800 dark:text-amber-400">{product.specs.socket}</div>
              </div>
            )}

            {product.specs?.ramType && (
              <div className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="text-zinc-600 dark:text-zinc-400">Memory Standard</div>
                <div className="font-mono font-semibold text-amber-800 dark:text-amber-400">{product.specs.ramType}</div>
              </div>
            )}

            {product.specs?.formFactor && (
              <div className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="text-zinc-600 dark:text-zinc-400">Form Factor</div>
                <div className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">{product.specs.formFactor}</div>
              </div>
            )}

            {product.specs?.wattage ? (
              <div className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="text-zinc-600 dark:text-zinc-400">Rated Power / TDP</div>
                <div className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {product.specs.wattage} Watts
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Related {product.category} Components
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {relatedProducts.map((rel) => {
                const relStock = stockMap.get(rel.id) ?? 0;
                return (
                  <article
                    key={rel.id}
                    onClick={() => onSelectProduct(rel.id)}
                    className="p-3.5 rounded-lg bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors flex flex-col justify-between group cursor-pointer"
                  >
                    <div className="space-y-2.5">
                      <ProductImage
                        imageUrl={rel.imageUrl}
                        sku={rel.sku}
                        name={rel.name}
                        category={rel.category}
                        className="w-full h-36"
                      />
                      <div className="text-[11px] text-amber-800 dark:text-amber-400 font-medium">
                        {rel.category} {rel.brand && `· ${rel.brand}`}
                      </div>
                      <h3 className="font-semibold text-zinc-950 dark:text-zinc-50 text-xs line-clamp-2 leading-snug group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors">
                        {rel.name}
                      </h3>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                        {formatCurrency(rel.price ?? 0, currencySymbol)}
                      </span>
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
                        {relStock > 0 ? `${relStock} in stock` : 'Backorder'}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </StorefrontShell>
  );
}
