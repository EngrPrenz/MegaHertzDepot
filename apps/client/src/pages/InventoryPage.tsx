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
  Sparkles,
  Cpu,
  ShieldCheck,
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

  // Reactive live queries from Dexie
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

  // Map product -> adjustments & stock info
  const adjustmentsByProduct = useMemo(() => {
    const map = new Map<string, typeof adjustments>();
    for (const adj of adjustments) {
      const list = map.get(adj.productId) || [];
      list.push(adj);
      map.set(adj.productId, list);
    }
    return map;
  }, [adjustments]);

  // Set of productIds that have unsynced mutations in the outbox
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
        // Support both 3-col (name,sku,stock) and 7-col hardware CSVs
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
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hardware by name, brand, or SKU..."
            data-testid="search-products-input"
            className="w-full bg-stone-900 border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {products.length < SAMPLE_PC_HARDWARE_CATALOG.length && (
            <button
              type="button"
              onClick={handleSeedCatalog}
              disabled={seeding}
              data-testid="inventory-seed-btn"
              className="px-3 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
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
            className="px-3 py-2.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-300 hover:text-white hover:bg-stone-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-stone-400" />
            <span className="hidden md:inline">Export CSV</span>
          </button>

          <label
            title="Import Inventory CSV"
            className="px-3 py-2.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-300 hover:text-white hover:bg-stone-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-stone-400" />
            <span className="hidden md:inline">Import CSV</span>
            <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
          </label>

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            data-testid="add-product-btn"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-amber-950/40 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Hardware</span>
          </button>
        </div>
      </div>

      {/* Status & Category Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>All Items ({enrichedProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('low')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              filter === 'low'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Low Stock ({enrichedProducts.filter((p) => p.isLowStock).length})
            </span>
          </button>

          {enrichedProducts.some((p) => p.isOversold) && (
            <button
              type="button"
              onClick={() => setFilter('oversold')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                filter === 'oversold'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-slate-900/70 text-rose-400 border border-rose-900/50 hover:text-rose-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>
                Oversold / Backorder ({enrichedProducts.filter((p) => p.isOversold).length})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              filter === 'pending'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>
              Pending Sync ({enrichedProducts.filter((p) => p.isPending).length})
            </span>
          </button>
        </div>

        <select
          aria-label="Filter by Hardware Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as HardwareCategory | 'All')}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="All">All Categories</option>
          {HARDWARE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Negative Stock Conflict Alert Banner (Offline Multi-Terminal Oversell Detection) */}
      {oversoldItems.length > 0 && (
        <div
          data-testid="negative-stock-conflict-banner"
          className="p-4 rounded-2xl bg-rose-950/40 border border-rose-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-bold text-rose-200">
                Negative Stock Conflict Detected ({oversoldItems.length} item
                {oversoldItems.length > 1 ? 's' : ''})
              </div>
              <p className="text-rose-300/90 leading-relaxed">
                Concurrent offline sales reduced derived stock below zero:{' '}
                <span className="font-mono font-semibold text-white">
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
              className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-rose-700/60 text-rose-200 text-xs font-semibold cursor-pointer transition"
            >
              {filter === 'oversold' ? 'Show All' : 'Inspect Oversold'}
            </button>
            <button
              type="button"
              onClick={handleReconcileOversoldToZero}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer transition shadow-sm"
            >
              Reconcile All to 0
            </button>
          </div>
        </div>
      )}

      {/* Main Master-Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Product List Column */}
        <div className={selectedItem ? 'lg:col-span-7 space-y-2.5' : 'lg:col-span-12 space-y-2.5'}>
          {filteredProducts.length === 0 ? (
            <div className="glass-panel rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">No hardware components found</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Add your first component offline, seed the {SAMPLE_PC_HARDWARE_CATALOG.length}-item PC catalog, or adjust your
                  search filter. All changes save instantly to IndexedDB.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                {products.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedCatalog}
                    disabled={seeding}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{seeding ? 'Seeding...' : `Seed ${SAMPLE_PC_HARDWARE_CATALOG.length} PC Components`}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsAddOpen(true)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-950/40"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Custom SKU</span>
                </button>
              </div>
            </div>
          ) : (
            filteredProducts.map((item) => {
              const isSelected = selectedProductId === item.product.id;
              return (
                <div
                  key={item.product.id}
                  onClick={() => setSelectedProductId(item.product.id)}
                  data-testid={`product-row-${item.product.name}`}
                  className={`glass-panel-interactive rounded-2xl p-4 flex items-center justify-between gap-4 cursor-pointer ${
                    isSelected ? 'ring-2 ring-amber-500/60 bg-stone-800/90' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <ProductImage
                      imageUrl={item.product.imageUrl}
                      name={item.product.name}
                      category={item.product.category}
                      className="w-12 h-12 rounded-xl shrink-0"
                    />

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                      {item.product.category && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-950 text-amber-400 border border-stone-800">
                          {item.product.category}
                        </span>
                      )}
                      {item.product.brand && (
                        <span className="text-[10px] font-semibold text-slate-400">
                          {item.product.brand}
                        </span>
                      )}
                      <h4 className="text-sm font-semibold text-white truncate">
                        {item.product.name}
                      </h4>
                      {item.product.sku && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {item.product.sku}
                        </span>
                      )}
                      {item.isPending && (
                        <span
                          data-testid="pending-sync-item-badge"
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-950/70 text-blue-300 border border-blue-800/70"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          Pending sync
                        </span>
                      )}
                      {item.isOversold ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/80">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          OVERSOLD / BACKORDER
                        </span>
                      ) : (
                        item.isLowStock && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-800/70">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Low stock
                          </span>
                        )
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap text-xs">
                      <span className="font-mono font-bold text-amber-400">
                        {formatCurrency(item.product.price || 0, currencySymbol)}
                      </span>
                      {item.product.warranty && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-slate-500" />
                          {item.product.warranty}
                        </span>
                      )}
                      {item.product.specs?.socket && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800/60">
                          {item.product.specs.socket}
                        </span>
                      )}
                      {item.product.specs?.ramType && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-800/60">
                          {item.product.specs.ramType}
                        </span>
                      )}
                      {item.product.specs?.wattage ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800/60">
                          {item.product.specs.wattage}W
                        </span>
                      ) : null}
                    </div>

                    {/* Count vs. Delta Discrepancy Note (Section 7) */}
                    {item.countSemantics.discrepancyExists && (
                      <p className="text-[11px] text-emerald-400/90 mt-1">
                        Counted {item.countSemantics.countedPhysical}, adjusted since:{' '}
                        {item.countSemantics.adjustedSinceCount > 0
                          ? `+${item.countSemantics.adjustedSinceCount}`
                          : item.countSemantics.adjustedSinceCount}
                        , now {item.stock}
                      </p>
                    )}
                  </div>
                </div>

                {/* Instant Mobile-Friendly Stepper + Derived Stock Readout */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleQuickStep(item.product, -1, e)}
                      aria-label={`Decrease ${item.product.name} stock`}
                      data-testid={`dec-stock-${item.product.name}`}
                      className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-700/80 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <div className="min-w-[3.2rem] text-center">
                      <div
                        data-testid={`stock-value-${item.product.name}`}
                        className={`text-lg font-extrabold tabular-nums ${
                          item.isOversold
                            ? 'text-rose-400'
                            : item.isLowStock
                            ? 'text-amber-400'
                            : 'text-white'
                        }`}
                      >
                        {item.stock}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        in stock
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleQuickStep(item.product, 1, e)}
                      aria-label={`Increase ${item.product.name} stock`}
                      data-testid={`inc-stock-${item.product.name}`}
                      className="w-9 h-9 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/40 flex items-center justify-center text-amber-300 hover:text-amber-200 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Product Detail & Adjustment History Column */}
        {selectedItem && (
          <div className="lg:col-span-5 glass-panel rounded-2xl p-5 space-y-5 self-start sticky top-20">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <ProductImage
                  imageUrl={selectedItem.product.imageUrl}
                  name={selectedItem.product.name}
                  category={selectedItem.product.category}
                  className="w-16 h-16 rounded-xl shrink-0"
                />

                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedItem.product.category && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-stone-950 text-amber-400 border border-stone-800">
                        {selectedItem.product.category}
                      </span>
                    )}
                    <h3 className="text-base font-bold text-white truncate">{selectedItem.product.name}</h3>
                    {selectedItem.product.sku && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-stone-900 text-stone-400 border border-stone-800">
                        {selectedItem.product.sku}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono font-bold text-amber-400">
                      SRP: {formatCurrency(selectedItem.product.price || 0, currencySymbol)}
                    </span>
                    {selectedItem.product.costPrice != null && (
                      <span className="font-mono text-slate-400">
                        Cost: {formatCurrency(selectedItem.product.costPrice, currencySymbol)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    HLC: {selectedItem.product.nameHlc.slice(0, 26)}...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  data-testid="edit-product-btn"
                  title="Edit Hardware Details & Price"
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProduct}
                  data-testid="delete-product-btn"
                  title="Delete Product (Tombstone)"
                  className="p-2 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-900/50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Count vs Delta Discrepancy Callout */}
            {selectedItem.countSemantics.hasCount && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-300 font-medium">
                  <span>Latest Physical Count:</span>
                  <span className="font-mono text-white">
                    {selectedItem.countSemantics.countedPhysical} units
                  </span>
                </div>
                {selectedItem.countSemantics.discrepancyExists && (
                  <div className="text-emerald-400 text-[11px]">
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
              className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80"
            >
              <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setAdjMode('delta')}
                  className={`flex-1 py-1 rounded-md font-medium cursor-pointer ${
                    adjMode === 'delta' ? 'bg-slate-800 text-white' : 'text-slate-400'
                  }`}
                >
                  Delta (+/-)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjMode('count')}
                  className={`flex-1 py-1 rounded-md font-medium cursor-pointer ${
                    adjMode === 'count' ? 'bg-slate-800 text-white' : 'text-slate-400'
                  }`}
                >
                  Exact Shelf Count
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {adjMode === 'count' ? 'Counted on Shelf' : 'Quantity Delta'}
                  </label>
                  <input
                    type="number"
                    required
                    value={adjValue}
                    onChange={(e) => setAdjValue(e.target.value)}
                    placeholder={adjMode === 'count' ? String(selectedItem.stock) : '+5 or -2'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white"
                  />
                </div>

                {adjMode === 'delta' ? (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Reason</label>
                    <select
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value as AdjustmentReason)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-white"
                    >
                      <option value="restock">Restock</option>
                      <option value="sale">Sale</option>
                      <option value="damage">Damage / RMA</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col justify-end text-[11px] text-slate-400 pb-1">
                    <span>
                      Computed delta:{' '}
                      <strong className="text-emerald-400">
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
                className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-950/40"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {adjMode === 'count' ? 'Record Physical Count' : 'Apply Stock Delta'}
                </span>
              </button>
            </form>

            {/* Adjustment History List */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span>Append-Only Movement Log ({selectedItem.adjustments.length})</span>
              </h4>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {selectedItem.adjustments.map((adj) => (
                  <div
                    key={adj.id}
                    className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="capitalize font-medium text-slate-200">{adj.reason}</span>
                        {adj.reason === 'count' && typeof adj.countedPhysical === 'number' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            shelf={adj.countedPhysical}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-0.5 font-mono">
                          <Smartphone className="w-2.5 h-2.5" />
                          {adj.deviceId.slice(0, 10)}
                        </span>
                        <span>•</span>
                        <span>{new Date(adj.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <span
                      className={`font-mono font-bold text-sm flex items-center ${
                        adj.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {adj.delta >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
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
        title="Add New PC Hardware Component"
        subtitle="Writes immediately to local IndexedDB and queues for sync."
      >
        <form onSubmit={handleCreateProduct} className="space-y-3.5">
          {/* Local Product Image Upload / Preset Selector */}
          <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
            <ProductImage
              imageUrl={newImageUrl}
              sku={newSku}
              name={newName || 'New Hardware'}
              category={newCategory}
              className="w-16 h-16 rounded-xl shrink-0"
            />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl text-xs font-bold shadow cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{newUploading ? 'Optimizing...' : 'Upload Local Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    disabled={newUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setNewUploading(true);
                      try {
                        const uri = await uploadProductImage(file);
                        setNewImageUrl(uri);
                      } finally {
                        setNewUploading(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
                {newImageUrl && (
                  <button
                    type="button"
                    onClick={() => setNewImageUrl('')}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 rounded-lg text-xs cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <select
                value={newImageUrl.startsWith('/images/products/') ? newImageUrl : ''}
                onChange={(e) => {
                  if (e.target.value) setNewImageUrl(e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300"
              >
                <option value="">Or choose a built-in local hardware preset image...</option>
                {SAMPLE_PC_HARDWARE_CATALOG.filter((item) => item.imageUrl).map((item) => (
                  <option key={item.sku} value={item.imageUrl}>
                    [{item.category}] {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Component / Model Name
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. AMD Ryzen 7 7800X3D"
              data-testid="new-product-name"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as HardwareCategory)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white"
              >
                {HARDWARE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Brand</label>
              <input
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="AMD / ASUS / MSI"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">SKU</label>
              <input
                type="text"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="CPU-7800X3D"
                data-testid="new-product-sku"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Retail Price ({currencySymbol})
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="24950"
                data-testid="new-product-price"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Cost ({currencySymbol}, Opt)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={newCostPrice}
                onChange={(e) => setNewCostPrice(e.target.value)}
                placeholder="21500"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Initial Stock</label>
              <input
                type="number"
                value={newInitialStock}
                onChange={(e) => setNewInitialStock(e.target.value)}
                data-testid="new-product-stock"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Warranty Policy</label>
            <input
              type="text"
              value={newWarranty}
              onChange={(e) => setNewWarranty(e.target.value)}
              placeholder="3 Years Manufacturer Warranty"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
            />
          </div>

          {/* PC Rig Compatibility Tags */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Rig Builder Compatibility Specs (Optional)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={newSocket}
                onChange={(e) => setNewSocket(e.target.value)}
                placeholder="Socket (AM5, LGA1700)"
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
              <input
                type="text"
                value={newRamType}
                onChange={(e) => setNewRamType(e.target.value)}
                placeholder="RAM (DDR5, DDR4)"
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
              <input
                type="number"
                value={newWattage}
                onChange={(e) => setNewWattage(e.target.value)}
                placeholder="Watts (TDP / PSU)"
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-product-btn"
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold cursor-pointer shadow-md shadow-amber-950/40"
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
        subtitle="Uses per-field Hybrid Logical Clock (HLC) Last-Write-Wins."
      >
        <form onSubmit={handleSaveEdit} className="space-y-3.5">
          {/* Local Product Image Upload / Preset Selector */}
          <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
            <ProductImage
              imageUrl={editImageUrl}
              sku={editSku}
              name={editName || 'Edit Hardware'}
              category={editCategory}
              className="w-16 h-16 rounded-xl shrink-0"
            />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl text-xs font-bold shadow cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{editUploading ? 'Optimizing...' : 'Replace Local Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    disabled={editUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setEditUploading(true);
                      try {
                        const uri = await uploadProductImage(file);
                        setEditImageUrl(uri);
                      } finally {
                        setEditUploading(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
                {editImageUrl && (
                  <button
                    type="button"
                    onClick={() => setEditImageUrl('')}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 rounded-lg text-xs cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <select
                value={editImageUrl.startsWith('/images/products/') ? editImageUrl : ''}
                onChange={(e) => {
                  if (e.target.value) setEditImageUrl(e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300"
              >
                <option value="">Or choose a built-in local hardware preset image...</option>
                {SAMPLE_PC_HARDWARE_CATALOG.filter((item) => item.imageUrl).map((item) => (
                  <option key={item.sku} value={item.imageUrl}>
                    [{item.category}] {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Component Name</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as HardwareCategory)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white"
              >
                {HARDWARE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Brand</label>
              <input
                type="text"
                value={editBrand}
                onChange={(e) => setEditBrand(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">SKU</label>
              <input
                type="text"
                value={editSku}
                onChange={(e) => setEditSku(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Retail Price ({currencySymbol})
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Cost Price ({currencySymbol})
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={editCostPrice}
                onChange={(e) => setEditCostPrice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Warranty</label>
            <input
              type="text"
              value={editWarranty}
              onChange={(e) => setEditWarranty(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Socket</label>
              <input
                type="text"
                value={editSocket}
                onChange={(e) => setEditSocket(e.target.value)}
                placeholder="AM5 / LGA1700"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">RAM Type</label>
              <input
                type="text"
                value={editRamType}
                onChange={(e) => setEditRamType(e.target.value)}
                placeholder="DDR5 / DDR4"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Wattage (W)</label>
              <input
                type="number"
                value={editWattage}
                onChange={(e) => setEditWattage(e.target.value)}
                placeholder="120 / 750"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold cursor-pointer shadow-md shadow-amber-950/40"
            >
              Save Changes
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
