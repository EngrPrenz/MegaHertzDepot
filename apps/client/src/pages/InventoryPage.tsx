import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import { ModalDialog } from '../components/ModalDialog.js';
import { ProductImage } from '../components/ProductImage.js';
import { uploadProductImage } from '../services/imageService.js';
import {
  computeDerivedStock,
  analyzeStockCountSemantics,
  AdjustmentReason,
  HARDWARE_CATEGORIES,
  HardwareCategory,
  SAMPLE_PC_HARDWARE_CATALOG,
  formatCurrency,
} from '@countwise/shared';
import {
  Search,
  Plus,
  Minus,
  Package,
  AlertTriangle,
  Clock,
  Edit3,
  Trash2,
  History,
  Download,
  Upload,
  CheckCircle2,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Smartphone,
  PackagePlus,
  Cpu,
  ShieldCheck,
  ImagePlus,
} from 'lucide-react';

interface InventoryPageProps {
  storeId: string;
  userId: string;
  lowStockThreshold: number;
  currencySymbol?: string;
}

export function InventoryPage({
  storeId,
  userId,
  lowStockThreshold,
  currencySymbol = '₱',
}: InventoryPageProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'oversold' | 'pending'>('all');
  const [categoryFilter, setCategoryFilter] = useState<HardwareCategory | 'All'>('All');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Add Product Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newCategory, setNewCategory] = useState<HardwareCategory>('CPU');
  const [newBrand, setNewBrand] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newWarranty, setNewWarranty] = useState('1 Year Store Warranty');
  const [newSocket, setNewSocket] = useState('');
  const [newRamType, setNewRamType] = useState('');
  const [newWattage, setNewWattage] = useState('');
  const [newInitialStock, setNewInitialStock] = useState('0');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newUploading, setNewUploading] = useState(false);

  // Edit Product Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editCategory, setEditCategory] = useState<HardwareCategory>('CPU');
  const [editBrand, setEditBrand] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCostPrice, setEditCostPrice] = useState('');
  const [editWarranty, setEditWarranty] = useState('');
  const [editSocket, setEditSocket] = useState('');
  const [editRamType, setEditRamType] = useState('');
  const [editWattage, setEditWattage] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editUploading, setEditUploading] = useState(false);

  // Stock Adjustment Form State inside Product Detail
  const [adjMode, setAdjMode] = useState<'delta' | 'count'>('delta');
  const [adjValue, setAdjValue] = useState('');
  const [adjReason, setAdjReason] = useState<AdjustmentReason>('restock');

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

  const outboxItems = useLiveQuery(
    () => localDb.outbox.where('storeId').equals(storeId).toArray(),
    [storeId],
    []
  );

  const adjustmentsByProduct = useMemo(() => {
    const map = new Map<string, typeof adjustments>();
    for (const adj of adjustments) {
      const list = map.get(adj.productId) || [];
      list.push(adj);
      map.set(adj.productId, list);
    }
    return map;
  }, [adjustments]);

  const pendingProductIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of outboxItems) {
      if (item.entityId) {
        set.add(item.entityId);
      } else if (item.payload?.productId) {
        set.add(item.payload.productId);
      } else if (item.payload?.id) {
        set.add(item.payload.id);
      }
    }
    return set;
  }, [outboxItems]);

  const enrichedProducts = useMemo(() => {
    return products
      .map((product) => {
        const prodAdjs = adjustmentsByProduct.get(product.id) || [];
        const stock = computeDerivedStock(prodAdjs);
        const isPending = pendingProductIds.has(product.id);
        const isOversold = stock < 0;
        const isLowStock = stock <= lowStockThreshold;
        const countSemantics = analyzeStockCountSemantics(
          prodAdjs.map((a) => ({
            ...a,
            countedPhysical: a.countedPhysical ?? null,
            localStockAtCount: a.localStockAtCount ?? null,
          }))
        );
        return {
          product,
          stock,
          isPending,
          isOversold,
          isLowStock,
          countSemantics,
          adjustments: [...prodAdjs].sort((a, b) => b.createdAt - a.createdAt),
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [products, adjustmentsByProduct, pendingProductIds, lowStockThreshold]);

  const filteredProducts = useMemo(() => {
    return enrichedProducts.filter((item) => {
      if (categoryFilter !== 'All' && item.product.category !== categoryFilter) {
        return false;
      }
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.product.name.toLowerCase().includes(q) ||
        (item.product.sku && item.product.sku.toLowerCase().includes(q)) ||
        (item.product.brand && item.product.brand.toLowerCase().includes(q));
      if (!matchesSearch) return false;
      if (filter === 'oversold') return item.isOversold;
      if (filter === 'low') return item.isLowStock;
      if (filter === 'pending') return item.isPending;
      return true;
    });
  }, [enrichedProducts, search, filter, categoryFilter]);

  const selectedItem = useMemo(
    () => enrichedProducts.find((i) => i.product.id === selectedProductId) || null,
    [enrichedProducts, selectedProductId]
  );

  const oversoldItems = useMemo(
    () => enrichedProducts.filter((i) => i.isOversold),
    [enrichedProducts]
  );

  const handleReconcileOversoldToZero = async () => {
    for (const item of oversoldItems) {
      await localRepository.recordPhysicalCount({
        productId: item.product.id,
        storeId,
        countedPhysical: 0,
        userId,
      });
    }
    if (filter === 'oversold') {
      setFilter('all');
    }
  };

  const handleSeedCatalog = async () => {
    setSeeding(true);
    try {
      await localRepository.seedSampleHardwareCatalog(storeId, userId);
    } finally {
      setSeeding(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const initialStockNum = parseInt(newInitialStock, 10) || 0;
    const priceNum = parseFloat(newPrice) || 0;
    const costNum = newCostPrice.trim() ? parseFloat(newCostPrice) : undefined;
    const wattageNum = newWattage.trim() ? parseInt(newWattage, 10) : undefined;

    const created = await localRepository.createProduct({
      storeId,
      name: newName,
      sku: newSku,
      category: newCategory,
      brand: newBrand || undefined,
      price: priceNum,
      costPrice: costNum,
      warranty: newWarranty || undefined,
      specs: {
        ...(newSocket.trim() ? { socket: newSocket.trim() } : {}),
        ...(newRamType.trim() ? { ramType: newRamType.trim() } : {}),
        ...(wattageNum !== undefined && !isNaN(wattageNum) ? { wattage: wattageNum } : {}),
      },
      imageUrl: newImageUrl.trim() || undefined,
      initialStock: initialStockNum,
      userId,
    });
    setNewName('');
    setNewSku('');
    setNewBrand('');
    setNewPrice('');
    setNewCostPrice('');
    setNewSocket('');
    setNewRamType('');
    setNewWattage('');
    setNewImageUrl('');
    setNewInitialStock('0');
    setIsAddOpen(false);
    setSelectedProductId(created.id);
  };

  const handleQuickStep = async (product: ProductLocal, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await localRepository.recordAdjustment({
      productId: product.id,
      storeId,
      delta,
      reason: delta > 0 ? 'restock' : 'sale',
      userId,
    });
  };

  const handleRecordAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const num = parseInt(adjValue, 10);
    if (isNaN(num)) return;

    if (adjMode === 'count') {
      await localRepository.recordPhysicalCount({
        productId: selectedItem.product.id,
        storeId,
        countedPhysical: num,
        userId,
      });
    } else {
      if (num === 0) return;
      await localRepository.recordAdjustment({
        productId: selectedItem.product.id,
        storeId,
        delta: num,
        reason: adjReason,
        userId,
      });
    }
    setAdjValue('');
  };

  const handleOpenEdit = () => {
    if (!selectedItem) return;
    const p = selectedItem.product;
    setEditName(p.name);
    setEditSku(p.sku || '');
    setEditCategory(p.category || 'CPU');
    setEditBrand(p.brand || '');
    setEditPrice(String(p.price ?? 0));
    setEditCostPrice(p.costPrice != null ? String(p.costPrice) : '');
    setEditWarranty(p.warranty || '');
    setEditSocket(p.specs?.socket || '');
    setEditRamType(p.specs?.ramType || '');
    setEditWattage(p.specs?.wattage != null ? String(p.specs.wattage) : '');
    setEditImageUrl(p.imageUrl || '');
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !editName.trim()) return;
    const priceNum = parseFloat(editPrice) || 0;
    const costNum = editCostPrice.trim() ? parseFloat(editCostPrice) : undefined;
    const wattageNum = editWattage.trim() ? parseInt(editWattage, 10) : undefined;

    await localRepository.updateProduct({
      id: selectedItem.product.id,
      storeId,
      name: editName,
      sku: editSku,
      category: editCategory,
      brand: editBrand || undefined,
      price: priceNum,
      costPrice: costNum,
      warranty: editWarranty || undefined,
      specs: {
        ...(editSocket.trim() ? { socket: editSocket.trim() } : {}),
        ...(editRamType.trim() ? { ramType: editRamType.trim() } : {}),
        ...(wattageNum !== undefined && !isNaN(wattageNum) ? { wattage: wattageNum } : {}),
      },
      imageUrl: editImageUrl.trim() || null,
    });
    setIsEditOpen(false);
  };

  const handleDeleteProduct = async () => {
    if (!selectedItem) return;
    await localRepository.deleteProduct({
      id: selectedItem.product.id,
      storeId,
    });
    setSelectedProductId(null);
  };

  // CSV Export & Import with PC Hardware fields
  const escapeCsvCell = (value: unknown): string => {
    let str = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(str) && !/^-\d+(\.\d+)?$/.test(str)) {
      str = `'${str}`;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleExportCsv = () => {
    const header = 'name,sku,category,brand,price,warranty,stock\n';
    const rows = enrichedProducts
      .map((i) =>
        [
          escapeCsvCell(i.product.name),
          escapeCsvCell(i.product.sku || ''),
          escapeCsvCell(i.product.category || ''),
          escapeCsvCell(i.product.brand || ''),
          Number(i.product.price || 0),
          escapeCsvCell(i.product.warranty || ''),
          Number(i.stock || 0),
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `megahertz-depot-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (let idx = 1; idx < lines.length; idx++) {
      const cols = parseCsvLine(lines[idx]);
      const [name, sku, stockOrCat, brand, priceStr, warranty, stockStr] = cols;
      if (name) {
        const isExtended = cols.length >= 5;
        const initialStock = parseInt((isExtended ? stockStr : stockOrCat) || '0', 10) || 0;
        const price = isExtended ? Math.max(0, parseFloat(priceStr || '0') || 0) : 0;
        await localRepository.createProduct({
          storeId,
          name,
          sku: sku || undefined,
          category: isExtended ? (stockOrCat as HardwareCategory) || 'Peripheral' : undefined,
          brand: isExtended ? brand || undefined : undefined,
          price,
          warranty: isExtended ? warranty || undefined : undefined,
          initialStock,
          userId,
        });
      }
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hardware by name, brand, or SKU..."
            data-testid="search-products-input"
            className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-3.5 pl-9 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {products.length < SAMPLE_PC_HARDWARE_CATALOG.length && (
            <button
              type="button"
              onClick={handleSeedCatalog}
              disabled={seeding}
              data-testid="inventory-seed-btn"
              className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <PackagePlus className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
              <span>
                {seeding
                  ? 'Seeding...'
                  : products.length === 0
                  ? `Seed Sample Hardware (${SAMPLE_PC_HARDWARE_CATALOG.length})`
                  : `Seed Missing Hardware (+${SAMPLE_PC_HARDWARE_CATALOG.length - products.length})`}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            title="Export Inventory CSV"
            className="px-3 py-2 rounded-md bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} />
            <span className="hidden md:inline">Export CSV</span>
          </button>

          <label
            title="Import Inventory CSV"
            className="px-3 py-2 rounded-md bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} />
            <span className="hidden md:inline">Import CSV</span>
            <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
          </label>

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            data-testid="add-product-btn"
            className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            <span>Add Hardware</span>
          </button>
        </div>
      </div>

      {/* Status & Category Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              filter === 'all'
                ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                : 'bg-white dark:bg-carbon text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>All Items ({enrichedProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('low')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              filter === 'low'
                ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                : 'bg-white dark:bg-carbon text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <AlertTriangle
              className={`w-3.5 h-3.5 ${filter === 'low' ? 'text-amber-400 dark:text-amber-600' : 'text-amber-700 dark:text-amber-400'}`}
              strokeWidth={1.75}
            />
            <span>Low Stock ({enrichedProducts.filter((p) => p.isLowStock).length})</span>
          </button>

          {enrichedProducts.some((p) => p.isOversold) && (
            <button
              type="button"
              onClick={() => setFilter('oversold')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                filter === 'oversold'
                  ? 'bg-red-700 text-white'
                  : 'bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-300 border border-red-200 dark:border-rose-800 hover:bg-red-100 dark:hover:bg-rose-950'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>
                Oversold ({enrichedProducts.filter((p) => p.isOversold).length})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              filter === 'pending'
                ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                : 'bg-white dark:bg-carbon text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Pending Sync ({enrichedProducts.filter((p) => p.isPending).length})</span>
          </button>
        </div>

        <select
          aria-label="Filter by Hardware Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as HardwareCategory | 'All')}
          className="bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-950 cursor-pointer"
        >
          <option value="All">All Categories</option>
          {HARDWARE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Negative Stock Conflict Alert Banner */}
      {oversoldItems.length > 0 && (
        <div
          data-testid="negative-stock-conflict-banner"
          className="p-4 rounded-lg bg-red-50 dark:bg-rose-950/40 border border-red-200 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-rose-400 shrink-0 mt-0.5" strokeWidth={1.75} />
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-red-950 dark:text-rose-100">
                Negative Stock Conflict Detected ({oversoldItems.length} item
                {oversoldItems.length > 1 ? 's' : ''})
              </div>
              <p className="text-red-800 dark:text-rose-200 leading-relaxed">
                Concurrent offline sales reduced derived stock below zero:{' '}
                <span className="font-mono font-semibold text-red-950 dark:text-rose-50">
                  {oversoldItems
                    .slice(0, 3)
                    .map((i) => `${i.product.name} (${i.stock})`)
                    .join(', ')}
                  {oversoldItems.length > 3 ? ` +${oversoldItems.length - 3} more` : ''}
                </span>
                . Verify physical shelf units or reconcile to 0.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFilter(filter === 'oversold' ? 'all' : 'oversold')}
              className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon hover:bg-red-100 dark:hover:bg-rose-950 border border-red-300 dark:border-rose-800 text-red-800 dark:text-rose-200 text-xs font-semibold cursor-pointer transition-colors"
            >
              {filter === 'oversold' ? 'Show All' : 'Inspect Oversold'}
            </button>
            <button
              type="button"
              onClick={handleReconcileOversoldToZero}
              className="px-3.5 py-1.5 rounded-md bg-red-700 hover:bg-red-800 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              Reconcile All to 0
            </button>
          </div>
        </div>
      )}

      {/* Main Master-Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Product Table Column */}
        <div className={selectedItem ? 'lg:col-span-7' : 'lg:col-span-12'}>
          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-md bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto text-zinc-500 dark:text-zinc-400">
                <Package className="w-6 h-6" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  No hardware components found
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                  Add your first component offline, seed the {SAMPLE_PC_HARDWARE_CATALOG.length}
                  -item hardware catalog, or adjust your search filter.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                {products.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedCatalog}
                    disabled={seeding}
                    className="px-4 py-2 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <PackagePlus className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                    <span>
                      {seeding
                        ? 'Seeding...'
                        : `Seed ${SAMPLE_PC_HARDWARE_CATALOG.length} PC Components`}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" strokeWidth={1.75} />
                  <span>Add Custom SKU</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              className="table-wrapper bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg"
              tabIndex={0}
              role="region"
              aria-label="Hardware inventory table"
            >
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-carbon-elevated border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold">
                    <th className="px-4 py-2.5">Hardware Item</th>
                    <th className="px-4 py-2.5 text-right">Retail SRP</th>
                    <th className="px-4 py-2.5 text-right">Stock Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredProducts.map((item) => {
                    const isSelected = selectedProductId === item.product.id;
                    return (
                      <tr
                        key={item.product.id}
                        onClick={() =>
                          setSelectedProductId(isSelected ? null : item.product.id)
                        }
                        data-testid={`product-row-${item.product.name}`}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-50/70 dark:bg-amber-950/30'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <td data-label="Hardware" className="px-4 py-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <ProductImage
                              imageUrl={item.product.imageUrl}
                              sku={item.product.sku}
                              name={item.product.name}
                              category={item.product.category}
                              className="w-11 h-11 shrink-0"
                            />
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-zinc-950 dark:text-zinc-50 text-xs sm:text-sm leading-snug">
                                  {item.product.name}
                                </span>
                                {item.product.sku && (
                                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                    {item.product.sku}
                                  </span>
                                )}
                                {item.isPending && (
                                  <span
                                    data-testid="pending-sync-item-badge"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700"
                                  >
                                    <Clock className="w-3 h-3" strokeWidth={1.75} />
                                    Pending sync
                                  </span>
                                )}
                                {item.isOversold ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-300 border border-red-200 dark:border-rose-800">
                                    <AlertTriangle className="w-3 h-3" strokeWidth={1.75} />
                                    Oversold
                                  </span>
                                ) : (
                                  item.isLowStock && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                      <AlertTriangle className="w-3 h-3" strokeWidth={1.75} />
                                      Low stock
                                    </span>
                                  )
                                )}
                              </div>

                              <div className="flex items-center flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <span>{item.product.category}</span>
                                {item.product.warranty && (
                                  <span className="inline-flex items-center gap-1">
                                    <ShieldCheck
                                      className="w-3 h-3 text-emerald-600 dark:text-emerald-400"
                                      strokeWidth={1.75}
                                    />
                                    {item.product.warranty}
                                  </span>
                                )}
                                {item.product.specs?.socket && (
                                  <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px]">
                                    {item.product.specs.socket}
                                  </span>
                                )}
                                {item.product.specs?.ramType && (
                                  <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px]">
                                    {item.product.specs.ramType}
                                  </span>
                                )}
                                {item.product.specs?.wattage ? (
                                  <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-[10px]">
                                    {item.product.specs.wattage}W
                                  </span>
                                ) : null}
                              </div>

                              {item.countSemantics.discrepancyExists && (
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                                  Counted {item.countSemantics.countedPhysical}, adjusted since:{' '}
                                  {item.countSemantics.adjustedSinceCount > 0
                                    ? `+${item.countSemantics.adjustedSinceCount}`
                                    : item.countSemantics.adjustedSinceCount}
                                  , now {item.stock}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td
                          data-label="Retail SRP"
                          className="px-4 py-3 text-right font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums whitespace-nowrap"
                        >
                          {formatCurrency(item.product.price || 0, currencySymbol)}
                        </td>

                        <td data-label="Stock" className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => handleQuickStep(item.product, -1, e)}
                              aria-label={`Decrease ${item.product.name} stock`}
                              data-testid={`dec-stock-${item.product.name}`}
                              className="w-8 h-8 rounded bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>

                            <div className="min-w-[2.75rem] text-center">
                              <div
                                data-testid={`stock-value-${item.product.name}`}
                                className={`text-sm font-bold font-mono tabular-nums ${
                                  item.isOversold
                                    ? 'text-red-700 dark:text-rose-400'
                                    : item.isLowStock
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-zinc-950 dark:text-zinc-50'
                                }`}
                              >
                                {item.stock}
                              </div>
                              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">in stock</div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleQuickStep(item.product, 1, e)}
                              aria-label={`Increase ${item.product.name} stock`}
                              data-testid={`inc-stock-${item.product.name}`}
                              className="w-8 h-8 rounded bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-950 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-800 dark:text-amber-300 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sticky Detail Inspector & Adjustment Panel */}
        {selectedItem && (
          <div className="lg:col-span-5 bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 space-y-4 self-start sticky top-16">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <ProductImage
                  imageUrl={selectedItem.product.imageUrl}
                  sku={selectedItem.product.sku}
                  name={selectedItem.product.name}
                  category={selectedItem.product.category}
                  className="w-16 h-16 shrink-0"
                />
                <div className="space-y-1 min-w-0">
                  <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                    {selectedItem.product.name}
                  </h3>
                  <div className="flex items-center flex-wrap gap-1.5 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">{selectedItem.product.category}</span>
                    {selectedItem.product.sku && (
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                        {selectedItem.product.sku}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="font-mono font-bold text-zinc-950 dark:text-zinc-50">
                      SRP: {formatCurrency(selectedItem.product.price || 0, currencySymbol)}
                    </span>
                    {selectedItem.product.costPrice != null && (
                      <span className="font-mono text-zinc-500 dark:text-zinc-400">
                        Cost: {formatCurrency(selectedItem.product.costPrice, currencySymbol)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono truncate">
                    HLC: {selectedItem.product.nameHlc.slice(0, 26)}...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  data-testid="edit-product-btn"
                  title="Edit Hardware Details & Price"
                  className="p-2 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 cursor-pointer transition-colors"
                >
                  <Edit3 className="w-4 h-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProduct}
                  data-testid="delete-product-btn"
                  title="Delete Product (Tombstone)"
                  className="p-2 rounded-md bg-red-50 dark:bg-rose-950/60 hover:bg-red-100 dark:hover:bg-rose-950 text-red-700 dark:text-rose-300 border border-red-200 dark:border-rose-800 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* Count vs Delta Discrepancy Callout */}
            {selectedItem.countSemantics.hasCount && (
              <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
                <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300 font-medium">
                  <span>Latest Physical Count</span>
                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {selectedItem.countSemantics.countedPhysical} units
                  </span>
                </div>
                {selectedItem.countSemantics.discrepancyExists && (
                  <div className="text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
                    Counted {selectedItem.countSemantics.countedPhysical}, adjusted since:{' '}
                    {selectedItem.countSemantics.adjustedSinceCount > 0
                      ? `+${selectedItem.countSemantics.adjustedSinceCount}`
                      : selectedItem.countSemantics.adjustedSinceCount}
                    , now {selectedItem.stock}
                  </div>
                )}
              </div>
            )}

            {/* Record Stock Movement Form */}
            <form
              onSubmit={handleRecordAdjustment}
              className="space-y-3 bg-zinc-50 dark:bg-carbon-elevated p-3.5 rounded-md border border-zinc-200 dark:border-zinc-800"
            >
              <div className="grid grid-cols-2 rounded bg-zinc-200/70 dark:bg-zinc-900 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setAdjMode('delta')}
                  className={`py-1.5 rounded font-semibold cursor-pointer transition-colors ${
                    adjMode === 'delta'
                      ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                >
                  Delta (+/-)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjMode('count')}
                  className={`py-1.5 rounded font-semibold cursor-pointer transition-colors ${
                    adjMode === 'count'
                      ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                >
                  Exact Shelf Count
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="inv-adj-value"
                    className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1"
                  >
                    {adjMode === 'count' ? 'Counted on Shelf' : 'Quantity Delta'}
                  </label>
                  <input
                    id="inv-adj-value"
                    type="number"
                    required
                    value={adjValue}
                    onChange={(e) => setAdjValue(e.target.value)}
                    placeholder={adjMode === 'count' ? String(selectedItem.stock) : '+5 or -2'}
                    className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950"
                  />
                </div>

                {adjMode === 'delta' ? (
                  <div>
                    <label
                      htmlFor="inv-adj-reason"
                      className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1"
                    >
                      Reason
                    </label>
                    <select
                      id="inv-adj-reason"
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value as AdjustmentReason)}
                      className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-sm text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950"
                    >
                      <option value="restock">Restock</option>
                      <option value="sale">Sale</option>
                      <option value="damage">Damage / RMA</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col justify-end text-[11px] text-zinc-600 dark:text-zinc-400 pb-1.5">
                    <span>
                      Computed delta:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                        {adjValue !== '' && !isNaN(parseInt(adjValue, 10))
                          ? parseInt(adjValue, 10) - selectedItem.stock >= 0
                            ? `+${parseInt(adjValue, 10) - selectedItem.stock}`
                            : parseInt(adjValue, 10) - selectedItem.stock
                          : '0'}
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>
                  {adjMode === 'count' ? 'Record Physical Count' : 'Apply Stock Delta'}
                </span>
              </button>
            </form>

            {/* Append-Only Movement History */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" strokeWidth={1.75} />
                <span>Append-Only Movement Log ({selectedItem.adjustments.length})</span>
              </h4>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {selectedItem.adjustments.map((adj) => (
                  <div
                    key={adj.id}
                    className="p-2.5 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="capitalize font-medium text-zinc-900 dark:text-zinc-100">{adj.reason}</span>
                        {adj.reason === 'count' && typeof adj.countedPhysical === 'number' && (
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                            shelf={adj.countedPhysical}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-0.5 font-mono">
                          <Smartphone className="w-3 h-3" strokeWidth={1.75} />
                          {adj.deviceId.slice(0, 10)}
                        </span>
                        <span>|</span>
                        <span>{new Date(adj.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <span
                      className={`font-mono font-bold text-sm flex items-center tabular-nums ${
                        adj.delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-rose-400'
                      }`}
                    >
                      {adj.delta >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" strokeWidth={1.75} />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" strokeWidth={1.75} />
                      )}
                      {adj.delta >= 0 ? `+${adj.delta}` : adj.delta}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Product Native Modal Dialog */}
      <ModalDialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add New Hardware SKU"
        subtitle="Saved locally in IndexedDB and queued for offline sync."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateProduct} className="space-y-3.5">
          {/* Local Product Photo Upload */}
          <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <ProductImage
              imageUrl={newImageUrl}
              name={newName || 'Preview'}
              category={newCategory}
              className="w-14 h-14 shrink-0"
            />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-2.5 py-1.5 rounded-md bg-white dark:bg-carbon hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                  <ImagePlus className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                  <span>{newUploading ? 'Compressing...' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={newUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setNewUploading(true);
                      try {
                        const ptr = await uploadProductImage(file);
                        setNewImageUrl(ptr);
                      } finally {
                        setNewUploading(false);
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {newImageUrl && (
                  <button
                    type="button"
                    onClick={() => setNewImageUrl('')}
                    className="text-xs text-red-700 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                aria-label="Image URL (Optional)"
                value={newImageUrl.startsWith('local-img:') ? 'Saved offline WebP photo' : newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                readOnly={newImageUrl.startsWith('local-img:')}
                placeholder="Or paste direct photo URL (optional)"
                className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="inv-new-name"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Product Name
            </label>
            <input
              id="inv-new-name"
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. AMD Ryzen 7 7800X3D Processor"
              data-testid="new-product-name"
              className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label
                htmlFor="inv-new-category"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Category
              </label>
              <select
                id="inv-new-category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as HardwareCategory)}
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950"
              >
                {HARDWARE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="inv-new-brand"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Brand
              </label>
              <input
                id="inv-new-brand"
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="AMD / ASUS / MSI"
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
              />
            </div>
            <div>
              <label
                htmlFor="inv-new-sku"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                SKU
              </label>
              <input
                id="inv-new-sku"
                type="text"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="CPU-7800X3D"
                data-testid="new-product-sku"
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label
                htmlFor="inv-new-price"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Retail Price ({currencySymbol})
              </label>
              <input
                id="inv-new-price"
                type="number"
                min={0}
                step="any"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="24950"
                data-testid="new-product-price"
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950"
              />
            </div>
            <div>
              <label
                htmlFor="inv-new-cost"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Cost ({currencySymbol}, Opt)
              </label>
              <input
                id="inv-new-cost"
                type="number"
                min={0}
                step="any"
                value={newCostPrice}
                onChange={(e) => setNewCostPrice(e.target.value)}
                placeholder="21500"
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950"
              />
            </div>
            <div>
              <label
                htmlFor="inv-new-stock"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Initial Stock
              </label>
              <input
                id="inv-new-stock"
                type="number"
                value={newInitialStock}
                onChange={(e) => setNewInitialStock(e.target.value)}
                data-testid="new-product-stock"
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="inv-new-warranty"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Warranty Policy
            </label>
            <input
              id="inv-new-warranty"
              type="text"
              value={newWarranty}
              onChange={(e) => setNewWarranty(e.target.value)}
              placeholder="3 Years Manufacturer Warranty"
              className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
            />
          </div>

          {/* PC Rig Compatibility Tags */}
          <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
              <span>Rig Builder Compatibility Specs (Optional)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                aria-label="Socket"
                value={newSocket}
                onChange={(e) => setNewSocket(e.target.value)}
                placeholder="Socket (AM5, LGA1700)"
                className="bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
              />
              <input
                type="text"
                aria-label="RAM Type"
                value={newRamType}
                onChange={(e) => setNewRamType(e.target.value)}
                placeholder="RAM (DDR5, DDR4)"
                className="bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
              />
              <input
                type="number"
                aria-label="Wattage"
                value={newWattage}
                onChange={(e) => setNewWattage(e.target.value)}
                placeholder="Watts (TDP / PSU)"
                className="bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-4 py-2 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-product-btn"
              className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold cursor-pointer transition-colors"
            >
              Create Hardware SKU
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Edit Product Native Modal Dialog */}
      <ModalDialog
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Hardware & Pricing"
        subtitle="Uses per-field Hybrid Logical Clock (HLC) conflict resolution."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveEdit} className="space-y-3.5">
          {/* Local Product Photo Upload */}
          <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <ProductImage
              imageUrl={editImageUrl}
              sku={editSku}
              name={editName || 'Preview'}
              category={editCategory}
              className="w-14 h-14 shrink-0"
            />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-2.5 py-1.5 rounded-md bg-white dark:bg-carbon hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                  <ImagePlus className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                  <span>{editUploading ? 'Compressing...' : 'Change Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={editUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setEditUploading(true);
                      try {
                        const ptr = await uploadProductImage(file);
                        setEditImageUrl(ptr);
                      } finally {
                        setEditUploading(false);
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {editImageUrl && (
                  <button
                    type="button"
                    onClick={() => setEditImageUrl('')}
                    className="text-xs text-red-700 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                aria-label="Edit Image URL"
                value={editImageUrl.startsWith('local-img:') ? 'Saved offline WebP photo' : editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
                readOnly={editImageUrl.startsWith('local-img:')}
                placeholder="Or paste direct photo URL (optional)"
                className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="inv-edit-name"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Product Name
            </label>
            <input
              id="inv-edit-name"
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label
                htmlFor="inv-edit-category"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Category
              </label>
              <select
                id="inv-edit-category"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as HardwareCategory)}
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950"
              >
                {HARDWARE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="inv-edit-brand"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Brand
              </label>
              <input
                id="inv-edit-brand"
                type="text"
                value={editBrand}
                onChange={(e) => setEditBrand(e.target.value)}
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950"
              />
            </div>
            <div>
              <label
                htmlFor="inv-edit-sku"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                SKU
              </label>
              <input
                id="inv-edit-sku"
                type="text"
                value={editSku}
                onChange={(e) => setEditSku(e.target.value)}
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="inv-edit-price"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Retail Price ({currencySymbol})
              </label>
              <input
                id="inv-edit-price"
                type="number"
                min={0}
                step="any"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950"
              />
            </div>
            <div>
              <label
                htmlFor="inv-edit-cost"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Cost Price ({currencySymbol})
              </label>
              <input
                id="inv-edit-cost"
                type="number"
                min={0}
                step="any"
                value={editCostPrice}
                onChange={(e) => setEditCostPrice(e.target.value)}
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="inv-edit-warranty"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Warranty
            </label>
            <input
              id="inv-edit-warranty"
              type="text"
              value={editWarranty}
              onChange={(e) => setEditWarranty(e.target.value)}
              className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label
                htmlFor="inv-edit-socket"
                className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1"
              >
                Socket
              </label>
              <input
                id="inv-edit-socket"
                type="text"
                value={editSocket}
                onChange={(e) => setEditSocket(e.target.value)}
                placeholder="AM5 / LGA1700"
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono focus:outline-none focus:border-zinc-950"
              />
            </div>
            <div>
              <label
                htmlFor="inv-edit-ram"
                className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1"
              >
                RAM Type
              </label>
              <input
                id="inv-edit-ram"
                type="text"
                value={editRamType}
                onChange={(e) => setEditRamType(e.target.value)}
                placeholder="DDR5 / DDR4"
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono focus:outline-none focus:border-zinc-950"
              />
            </div>
            <div>
              <label
                htmlFor="inv-edit-wattage"
                className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1"
              >
                Wattage (W)
              </label>
              <input
                id="inv-edit-wattage"
                type="number"
                value={editWattage}
                onChange={(e) => setEditWattage(e.target.value)}
                placeholder="120 / 750"
                className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono focus:outline-none focus:border-zinc-950"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold cursor-pointer transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
