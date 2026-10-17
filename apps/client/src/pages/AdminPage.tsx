import React, { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import { ModalDialog } from '../components/ModalDialog.js';
import { ProductImage } from '../components/ProductImage.js';
import { uploadProductImage } from '../services/imageService.js';
import {
  HardwareCategory,
  HardwareSpecs,
  HARDWARE_CATEGORIES,
  computeDerivedStock,
  formatCurrency,
  SAMPLE_PC_HARDWARE_CATALOG,
} from '@countwise/shared';
import {
  ShieldAlert,
  Search,
  Plus,
  Edit3,
  Trash2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Package,
  Layers,
  X,
  LayoutGrid,
  List,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

interface AdminPageProps {
  storeId: string;
  userId: string;
  userRole?: string;
  token?: string | null;
  currencySymbol?: string;
  lowStockThreshold?: number;
}

export function AdminPage({
  storeId,
  userId,
  userRole = 'owner',
  token,
  currencySymbol = '₱',
  lowStockThreshold = 3,
}: AdminPageProps) {
  // Check permission
  const isOwner = userRole === 'owner';

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HardwareCategory | 'All'>('All');
  const [sortBy, setSortBy] = useState<'name' | 'price-asc' | 'price-desc' | 'stock-asc' | 'stock-desc'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Add Product Form State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSku, setAddSku] = useState('');
  const [addCategory, setAddCategory] = useState<HardwareCategory>('GPU');
  const [addBrand, setAddBrand] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addCostPrice, setAddCostPrice] = useState('');
  const [addWarranty, setAddWarranty] = useState('1 Year Store Warranty');
  const [addInitialStock, setAddInitialStock] = useState('5');
  const [addSocket, setAddSocket] = useState('');
  const [addRamType, setAddRamType] = useState('');
  const [addWattage, setAddWattage] = useState('');
  const [addImageUrl, setAddImageUrl] = useState('');
  const [addUploading, setAddUploading] = useState(false);

  // Edit Product Form State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductLocal | null>(null);
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editCategory, setEditCategory] = useState<HardwareCategory>('GPU');
  const [editBrand, setEditBrand] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCostPrice, setEditCostPrice] = useState('');
  const [editWarranty, setEditWarranty] = useState('');
  const [editSocket, setEditSocket] = useState('');
  const [editRamType, setEditRamType] = useState('');
  const [editWattage, setEditWattage] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editUploading, setEditUploading] = useState(false);

  // Delete Confirmation Modal State
  const [deleteCandidate, setDeleteCandidate] = useState<ProductLocal | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  // Preview Image Modal
  const [previewProduct, setPreviewProduct] = useState<ProductLocal | null>(null);

  // File input refs
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Reactive DB queries
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

  // Stock calculation map
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const pAdjustments = adjustments.filter((a) => a.productId === p.id);
      map.set(p.id, computeDerivedStock(pAdjustments));
    }
    return map;
  }, [products, adjustments]);

  // Catalog statistics
  const stats = useMemo(() => {
    let totalItems = 0;
    let lowStockCount = 0;
    let totalValuation = 0;
    const catSet = new Set<string>();

    for (const p of products) {
      totalItems += 1;
      const stock = stockMap.get(p.id) ?? 0;
      if (stock <= lowStockThreshold) {
        lowStockCount += 1;
      }
      totalValuation += (p.price ?? 0) * Math.max(0, stock);
      if (p.category) catSet.add(p.category);
    }

    return {
      totalProducts: totalItems,
      lowStockCount,
      totalValuation,
      categoryCount: catSet.size,
    };
  }, [products, stockMap, lowStockThreshold]);

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (selectedCategory !== 'All' && p.category !== selectedCategory) {
          return false;
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
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'price-asc') return (a.price ?? 0) - (b.price ?? 0);
        if (sortBy === 'price-desc') return (b.price ?? 0) - (a.price ?? 0);
        const stockA = stockMap.get(a.id) ?? 0;
        const stockB = stockMap.get(b.id) ?? 0;
        if (sortBy === 'stock-asc') return stockA - stockB;
        if (sortBy === 'stock-desc') return stockB - stockA;
        return 0;
      });
  }, [products, selectedCategory, search, sortBy, stockMap]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Image Upload Handler
  const handleFileUpload = async (
    file: File,
    target: 'add' | 'edit'
  ) => {
    if (target === 'add') setAddUploading(true);
    else setEditUploading(true);

    try {
      const url = await uploadProductImage(file, token);
      if (target === 'add') {
        setAddImageUrl(url);
      } else {
        setEditImageUrl(url);
      }
      showToast('Image uploaded and optimized locally!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Image upload failed', 'error');
    } finally {
      if (target === 'add') setAddUploading(false);
      else setEditUploading(false);
    }
  };

  // Create Product Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      showToast('Product name is required', 'error');
      return;
    }

    const priceNum = parseFloat(addPrice) || 0;
    const costPriceNum = addCostPrice.trim() ? parseFloat(addCostPrice) : undefined;
    const initialStockNum = parseInt(addInitialStock, 10) || 0;

    const specs: HardwareSpecs = {};
    if (addSocket.trim()) specs.socket = addSocket.trim();
    if (addRamType.trim()) specs.ramType = addRamType.trim();
    if (addWattage.trim()) specs.wattage = parseInt(addWattage, 10) || undefined;

    try {
      await localRepository.createProduct({
        storeId,
        name: addName.trim(),
        sku: addSku.trim() || undefined,
        category: addCategory,
        brand: addBrand.trim() || undefined,
        price: priceNum,
        costPrice: costPriceNum,
        warranty: addWarranty.trim() || undefined,
        specs: Object.keys(specs).length > 0 ? specs : undefined,
        imageUrl: addImageUrl.trim() || undefined,
        initialStock: initialStockNum,
        userId,
      });

      showToast(`Added product "${addName.trim()}" successfully!`);
      setIsAddOpen(false);
      // Reset form
      setAddName('');
      setAddSku('');
      setAddBrand('');
      setAddPrice('');
      setAddCostPrice('');
      setAddSocket('');
      setAddRamType('');
      setAddWattage('');
      setAddImageUrl('');
      setAddInitialStock('5');
    } catch (err: any) {
      showToast(err.message || 'Failed to create product', 'error');
    }
  };

  // Open Edit Modal
  const openEditModal = (product: ProductLocal) => {
    setEditProduct(product);
    setEditName(product.name);
    setEditSku(product.sku || '');
    setEditCategory(product.category || 'Peripheral');
    setEditBrand(product.brand || '');
    setEditPrice(product.price !== undefined ? product.price.toString() : '0');
    setEditCostPrice(product.costPrice !== undefined && product.costPrice !== null ? product.costPrice.toString() : '');
    setEditWarranty(product.warranty || '1 Year Store Warranty');
    setEditSocket(product.specs?.socket || '');
    setEditRamType(product.specs?.ramType || '');
    setEditWattage(product.specs?.wattage ? product.specs.wattage.toString() : '');
    setEditImageUrl(product.imageUrl || '');
    setIsEditOpen(true);
  };

  // Update Product Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct || !editName.trim()) return;

    const priceNum = parseFloat(editPrice) || 0;
    const costPriceNum = editCostPrice.trim() ? parseFloat(editCostPrice) : undefined;

    const specs: HardwareSpecs = {};
    if (editSocket.trim()) specs.socket = editSocket.trim();
    if (editRamType.trim()) specs.ramType = editRamType.trim();
    if (editWattage.trim()) specs.wattage = parseInt(editWattage, 10) || undefined;

    try {
      await localRepository.updateProduct({
        id: editProduct.id,
        storeId,
        name: editName.trim(),
        sku: editSku.trim() || undefined,
        category: editCategory,
        brand: editBrand.trim() || undefined,
        price: priceNum,
        costPrice: costPriceNum,
        warranty: editWarranty.trim() || undefined,
        specs: Object.keys(specs).length > 0 ? specs : undefined,
        imageUrl: editImageUrl.trim() || null,
      });

      showToast(`Updated "${editName.trim()}" successfully!`);
      setIsEditOpen(false);
      setEditProduct(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to update product', 'error');
    }
  };

  // Delete Product Handler
  const handleDeleteConfirm = async () => {
    if (!deleteCandidate) return;
    try {
      await localRepository.deleteProduct({
        id: deleteCandidate.id,
        storeId,
      });
      showToast(`Archived "${deleteCandidate.name}"`);
      setDeleteCandidate(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete product', 'error');
    }
  };

  // Bulk Delete Handler
  const handleBulkDeleteConfirm = async () => {
    try {
      for (const id of selectedProductIds) {
        await localRepository.deleteProduct({ id, storeId });
      }
      showToast(`Archived ${selectedProductIds.length} products`);
      setSelectedProductIds([]);
      setIsBulkDeleteOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Bulk delete failed', 'error');
    }
  };

  // Seed sample catalog
  const handleSeedCatalog = async () => {
    setSeeding(true);
    try {
      let count = 0;
      for (const item of SAMPLE_PC_HARDWARE_CATALOG) {
        const exists = await localDb.products.get(item.id);
        if (!exists) {
          await localRepository.createProduct({
            id: item.id,
            storeId,
            name: item.name,
            sku: item.sku,
            category: item.category,
            brand: item.brand,
            price: item.price,
            costPrice: item.costPrice,
            warranty: item.warranty,
            specs: item.specs,
            initialStock: item.initialStock,
            userId,
          });
          count++;
        }
      }
      showToast(`Seeded ${count} hardware items to catalog!`);
    } catch (err: any) {
      showToast(err.message || 'Seeding failed', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.length === filteredProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map((p) => p.id));
    }
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">Owner Access Restricted</h2>
        <p className="text-sm text-stone-400 max-w-md">
          The Admin Catalog Manager requires Store Owner permissions. Your current role is{' '}
          <span className="font-mono text-amber-400">{userRole}</span>. Please contact the store owner
          for catalog changes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {statusMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 ${
            statusMessage.type === 'success'
              ? 'bg-stone-900/90 text-amber-200 border-amber-500/30'
              : 'bg-rose-950/90 text-rose-200 border-rose-500/30'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Header & Stats Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Package className="w-6 h-6 text-amber-400" />
              Admin Catalog & Item Manager
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Store Owner Mode
            </span>
          </div>
          <p className="text-sm text-stone-400 mt-1">
            Create, update, and manage products, pictures, local hardware catalog, and stock values.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {products.length === 0 && (
            <button
              onClick={handleSeedCatalog}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
              Seed Hardware Catalog
            </button>
          )}

          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg shadow-amber-950/40 transition transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add New Product
          </button>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-stone-900/60 border border-stone-800/80 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-stone-400">Total Products</div>
            <div className="text-2xl font-bold text-white font-mono">{stats.totalProducts}</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-stone-900/60 border border-stone-800/80 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-stone-400">Low Stock Alert</div>
            <div className="text-2xl font-bold text-amber-400 font-mono">{stats.lowStockCount}</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-stone-900/60 border border-stone-800/80 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-stone-400">Catalog Valuation</div>
            <div className="text-2xl font-bold text-amber-400 font-mono">
              {formatCurrency(stats.totalValuation, currencySymbol)}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-stone-900/60 border border-stone-800/80 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-stone-400">Categories</div>
            <div className="text-2xl font-bold text-white font-mono">{stats.categoryCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="space-y-3 bg-stone-900/40 p-4 rounded-2xl border border-stone-800">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Search product by name, SKU, or brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-stone-950/80 border border-stone-700 rounded-xl text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Sort Select */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-stone-950/80 border border-stone-700 rounded-xl text-xs text-stone-300 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="name">Sort by Name</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="stock-asc">Stock: Low to High</option>
              <option value="stock-desc">Stock: High to Low</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-stone-950/80 border border-stone-700 rounded-xl p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'table' ? 'bg-amber-500 text-stone-950 font-bold' : 'text-stone-400 hover:text-white'
                }`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'grid' ? 'bg-amber-500 text-stone-950 font-bold' : 'text-stone-400 hover:text-white'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-3.5 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
            }`}
          >
            All Categories
          </button>
          {HARDWARE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl font-semibold transition whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                  : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Bulk Action Controls */}
        {selectedProductIds.length > 0 && (
          <div className="flex items-center justify-between bg-stone-900/90 border border-amber-500/30 rounded-xl px-4 py-2 text-xs">
            <span className="text-amber-300 font-medium">
              {selectedProductIds.length} product(s) selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedProductIds([])}
                className="px-2.5 py-1 text-stone-400 hover:text-white cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={() => setIsBulkDeleteOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Archive Selected
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Catalog Display: Table or Grid */}
      {filteredProducts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-stone-900/40 border border-stone-800">
          <Package className="w-12 h-12 text-stone-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-stone-300">No products found</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
            {search || selectedCategory !== 'All'
              ? 'Try modifying your search query or category filter.'
              : 'Add your first hardware item or seed the sample catalog to get started.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="overflow-x-auto rounded-2xl border border-stone-800 bg-stone-900/60 shadow-lg">
          <table className="w-full text-left text-sm text-stone-300">
            <thead className="bg-stone-950/80 text-xs font-semibold text-stone-400 uppercase tracking-wider border-b border-stone-800">
              <tr>
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      filteredProducts.length > 0 &&
                      selectedProductIds.length === filteredProducts.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-stone-700 bg-stone-900 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                  />
                </th>
                <th className="p-3 w-20">Picture</th>
                <th className="p-3">Product Name & Specs</th>
                <th className="p-3">Category</th>
                <th className="p-3">SKU</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Cost</th>
                <th className="p-3 text-center">Stock</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60">
              {filteredProducts.map((product) => {
                const stock = stockMap.get(product.id) ?? 0;
                const isSelected = selectedProductIds.includes(product.id);
                const isLow = stock <= lowStockThreshold;

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-stone-800/40 transition group ${
                      isSelected ? 'bg-amber-950/20' : ''
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectProduct(product.id)}
                        className="rounded border-stone-700 bg-stone-900 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                      />
                    </td>
                    <td className="p-3">
                      <div
                        className="cursor-pointer group-hover:scale-105 transition-transform"
                        onClick={() => setPreviewProduct(product)}
                      >
                        <ProductImage
                          imageUrl={product.imageUrl}
                          name={product.name}
                          category={product.category}
                          className="w-12 h-12 rounded-xl"
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-white group-hover:text-amber-300 transition">
                        {product.name}
                      </div>
                      <div className="text-xs text-stone-500 flex items-center gap-2 mt-0.5">
                        {product.brand && (
                          <span className="font-medium text-stone-400">{product.brand}</span>
                        )}
                        {product.specs?.socket && (
                          <span className="px-1.5 py-0.2 bg-stone-800 rounded font-mono text-[10px] text-stone-300 border border-stone-700/60">
                            {product.specs.socket}
                          </span>
                        )}
                        {product.specs?.wattage && (
                          <span className="px-1.5 py-0.2 bg-stone-800 rounded font-mono text-[10px] text-stone-300 border border-stone-700/60">
                            {product.specs.wattage}W
                          </span>
                        )}
                        {product.specs?.ramType && (
                          <span className="px-1.5 py-0.2 bg-stone-800 rounded font-mono text-[10px] text-amber-400 border border-stone-700/60">
                            {product.specs.ramType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-800 text-stone-300 border border-stone-700">
                        {product.category || 'Peripheral'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-stone-400">
                      {product.sku || '—'}
                    </td>
                    <td className="p-3 text-right font-semibold text-amber-400 font-mono">
                      {formatCurrency(product.price ?? 0, currencySymbol)}
                    </td>
                    <td className="p-3 text-right font-mono text-xs text-stone-400">
                      {product.costPrice !== undefined && product.costPrice !== null
                        ? formatCurrency(product.costPrice, currencySymbol)
                        : '—'}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                          stock <= 0
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : isLow
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-stone-950 text-stone-300 border border-stone-800'
                        }`}
                      >
                        {stock}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
                          title="Edit Product & Picture"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(product)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                          title="Archive / Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((product) => {
            const stock = stockMap.get(product.id) ?? 0;
            const isSelected = selectedProductIds.includes(product.id);
            const isLow = stock <= lowStockThreshold;

            return (
              <div
                key={product.id}
                className={`relative rounded-2xl border p-4 bg-stone-900/60 hover:border-amber-500/50 transition-all flex flex-col justify-between group shadow-sm ${
                  isSelected ? 'border-amber-500 bg-amber-950/20' : 'border-stone-800'
                }`}
              >
                <div>
                  {/* Card Header Picture & Badges */}
                  <div className="relative mb-3 flex items-center justify-center">
                    <div
                      className="cursor-pointer w-full flex items-center justify-center"
                      onClick={() => setPreviewProduct(product)}
                    >
                      <ProductImage
                        imageUrl={product.imageUrl}
                        name={product.name}
                        category={product.category}
                        className="w-full h-40 rounded-xl"
                      />
                    </div>

                    <div className="absolute top-2 left-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectProduct(product.id)}
                        className="rounded border-stone-700 bg-stone-900/80 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                      />
                    </div>

                    <div className="absolute top-2 right-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold font-mono backdrop-blur-md ${
                          stock <= 0
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : isLow
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-stone-950 text-stone-300 border border-stone-800'
                        }`}
                      >
                        {stock} in stock
                      </span>
                    </div>
                  </div>

                  {/* Title & Brand */}
                  <h4 className="font-semibold text-white text-sm line-clamp-2 leading-snug group-hover:text-amber-300 transition">
                    {product.name}
                  </h4>

                  <div className="flex items-center gap-2 mt-2 text-xs text-stone-400">
                    <span className="font-medium text-stone-300">{product.brand || 'MegaHertz'}</span>
                    <span>•</span>
                    <span className="font-mono">{product.sku || 'No SKU'}</span>
                  </div>

                  {/* Specs Chips */}
                  {product.specs && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {product.specs.socket && (
                        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-[10px] font-mono border border-stone-700/60">
                          {product.specs.socket}
                        </span>
                      )}
                      {product.specs.wattage && (
                        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-[10px] font-mono border border-stone-700/60">
                          {product.specs.wattage}W
                        </span>
                      )}
                      {product.specs.ramType && (
                        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-amber-400 text-[10px] font-mono border border-stone-700/60">
                          {product.specs.ramType}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Price & Actions */}
                <div className="mt-4 pt-3 border-t border-stone-800/80 flex items-center justify-between">
                  <div>
                    <div className="text-base font-bold text-amber-400 font-mono">
                      {formatCurrency(product.price ?? 0, currencySymbol)}
                    </div>
                    {product.costPrice !== undefined && product.costPrice !== null && (
                      <div className="text-[10px] text-stone-500">
                        Cost: {formatCurrency(product.costPrice, currencySymbol)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(product)}
                      className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition cursor-pointer"
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteCandidate(product)}
                      className="p-1.5 rounded-lg bg-stone-800 hover:bg-rose-900/40 text-stone-300 hover:text-rose-300 transition cursor-pointer"
                      title="Archive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= ADD PRODUCT MODAL ================= */}
      <ModalDialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Create New Product"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {/* Image Upload Dropzone */}
          <div>
            <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
              Product Picture (Stored Locally)
            </label>
            <div className="flex items-center gap-4 p-3 bg-stone-950 rounded-xl border border-stone-800">
              <ProductImage
                imageUrl={addImageUrl}
                name={addName || 'New Product'}
                category={addCategory}
                className="w-20 h-20 rounded-xl shrink-0"
              />
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  ref={addFileInputRef}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'add');
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addFileInputRef.current?.click()}
                    disabled={addUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl text-xs font-bold shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {addUploading ? 'Optimizing...' : 'Upload Picture'}
                  </button>
                  {addImageUrl && (
                    <button
                      type="button"
                      onClick={() => setAddImageUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-stone-800 hover:bg-rose-900/40 text-stone-300 hover:text-rose-300 rounded-lg text-xs transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-stone-500">
                  Compressed automatically in-browser (max 800px WebP) to save disk space.
                </p>
              </div>
            </div>
          </div>

          {/* Name & SKU */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. GeForce RTX 4070 SUPER 12GB"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">SKU / Code</label>
              <input
                type="text"
                placeholder="e.g. GPU-NV-4070S"
                value={addSku}
                onChange={(e) => setAddSku(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Category & Brand */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">Category</label>
              <select
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value as HardwareCategory)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {HARDWARE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">Brand</label>
              <input
                type="text"
                placeholder="e.g. ASUS, MSI, Corsair"
                value={addBrand}
                onChange={(e) => setAddBrand(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Pricing & Stock */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">
                Retail Price ({currencySymbol}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                placeholder="0.00"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">
                Cost Price ({currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Optional"
                value={addCostPrice}
                onChange={(e) => setAddCostPrice(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">Initial Stock</label>
              <input
                type="number"
                min="0"
                value={addInitialStock}
                onChange={(e) => setAddInitialStock(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Warranty & Hardware Specs */}
          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1">Warranty Term</label>
            <input
              type="text"
              placeholder="e.g. 1 Year Store Warranty"
              value={addWarranty}
              onChange={(e) => setAddWarranty(e.target.value)}
              className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-stone-800">
            <div>
              <label className="block text-[11px] font-medium text-stone-500 mb-1">Socket</label>
              <input
                type="text"
                placeholder="AM5 / LGA1700"
                value={addSocket}
                onChange={(e) => setAddSocket(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-500 mb-1">RAM Type</label>
              <input
                type="text"
                placeholder="DDR5 / DDR4"
                value={addRamType}
                onChange={(e) => setAddRamType(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-500 mb-1">Wattage</label>
              <input
                type="number"
                placeholder="Watts"
                value={addWattage}
                onChange={(e) => setAddWattage(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-300 font-mono"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-800">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-4 py-2 text-sm text-stone-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl text-sm font-bold shadow-lg shadow-amber-950/40 transition cursor-pointer"
            >
              Save Product
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* ================= EDIT PRODUCT MODAL ================= */}
      <ModalDialog
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Edit Product: ${editProduct?.name || ''}`}
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {/* Image Upload Dropzone */}
          <div>
            <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
              Product Picture (Stored Locally)
            </label>
            <div className="flex items-center gap-4 p-3 bg-stone-950 rounded-xl border border-stone-800">
              <ProductImage
                imageUrl={editImageUrl}
                name={editName || 'Edit Product'}
                category={editCategory}
                className="w-20 h-20 rounded-xl shrink-0"
              />
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  ref={editFileInputRef}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'edit');
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    disabled={editUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl text-xs font-bold shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {editUploading ? 'Optimizing...' : 'Replace Picture'}
                  </button>
                  {editImageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditImageUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-stone-800 hover:bg-rose-900/40 text-stone-300 hover:text-rose-300 rounded-lg text-xs transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-stone-500">
                  Compressed automatically in-browser (max 800px WebP) to save disk space.
                </p>
              </div>
            </div>
          </div>

          {/* Name & SKU */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">SKU / Code</label>
              <input
                type="text"
                value={editSku}
                onChange={(e) => setEditSku(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Category & Brand */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">Category</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as HardwareCategory)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {HARDWARE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">Brand</label>
              <input
                type="text"
                value={editBrand}
                onChange={(e) => setEditBrand(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">
                Retail Price ({currencySymbol}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1">
                Cost Price ({currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={editCostPrice}
                onChange={(e) => setEditCostPrice(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Warranty */}
          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1">Warranty Term</label>
            <input
              type="text"
              value={editWarranty}
              onChange={(e) => setEditWarranty(e.target.value)}
              className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Hardware Compatibility Specs */}
          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-stone-800">
            <div>
              <label className="block text-[11px] font-medium text-stone-500 mb-1">Socket</label>
              <input
                type="text"
                value={editSocket}
                onChange={(e) => setEditSocket(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-500 mb-1">RAM Type</label>
              <input
                type="text"
                value={editRamType}
                onChange={(e) => setEditRamType(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-500 mb-1">Wattage</label>
              <input
                type="number"
                value={editWattage}
                onChange={(e) => setEditWattage(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-300 font-mono"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-800">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 text-sm text-stone-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl text-sm font-bold shadow-lg shadow-amber-950/40 transition cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* ================= DELETE CONFIRMATION MODAL ================= */}
      <ModalDialog
        open={!!deleteCandidate}
        onClose={() => setDeleteCandidate(null)}
        title="Confirm Product Archive"
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-300">
            Are you sure you want to archive{' '}
            <strong className="text-white">"{deleteCandidate?.name}"</strong>?
          </p>
          <p className="text-xs text-stone-500">
            This marks the item with a tombstone so offline devices can synchronize the deletion
            deterministically without data loss.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDeleteCandidate(null)}
              className="px-4 py-2 text-sm text-stone-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl shadow transition cursor-pointer"
            >
              Archive Product
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* ================= BULK DELETE MODAL ================= */}
      <ModalDialog
        open={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        title="Confirm Bulk Archive"
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-300">
            Are you sure you want to archive{' '}
            <strong className="text-white">{selectedProductIds.length}</strong> selected products?
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsBulkDeleteOpen(false)}
              className="px-4 py-2 text-sm text-stone-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteConfirm}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl shadow transition cursor-pointer"
            >
              Archive Selected
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* ================= PREVIEW IMAGE MODAL ================= */}
      <ModalDialog
        open={!!previewProduct}
        onClose={() => setPreviewProduct(null)}
        title={previewProduct ? previewProduct.name : 'Image Preview'}
      >
        {previewProduct && (
          <div className="flex flex-col items-center space-y-4">
            <ProductImage
              imageUrl={previewProduct.imageUrl}
              name={previewProduct.name}
              category={previewProduct.category}
              className="w-full max-w-sm h-64 rounded-2xl"
            />
            <div className="text-center space-y-1">
              <div className="font-semibold text-white">{previewProduct.name}</div>
              <div className="text-xs text-stone-400">
                {previewProduct.brand} • {previewProduct.category} • SKU: {previewProduct.sku || 'N/A'}
              </div>
              <div className="text-lg font-bold text-amber-400 font-mono">
                {formatCurrency(previewProduct.price ?? 0, currencySymbol)}
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  const p = previewProduct;
                  setPreviewProduct(null);
                  openEditModal(p);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl text-xs font-bold shadow-md shadow-amber-950/40 transition cursor-pointer"
              >
                Edit Details / Replace Picture
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
