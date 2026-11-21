import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, ProductLocal } from '../db/index.js';
import { ReceiptQuoteModal, QuoteBuildData } from '../components/ReceiptQuoteModal.js';
import { ProductImage } from '../components/ProductImage.js';
import { PcRigSilhouette } from '../components/PcRigSilhouette.js';
import {
  HARDWARE_CATEGORIES,
  HardwareCategory,
  analyzePcBuildCompatibility,
  formatCurrency,
} from '@countwise/shared';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ShoppingCart,
  FileText,
  RotateCcw,
  Sparkles,
  Search,
  Check,
  Server,
  Layers,
  HardDrive,
  Box,
  Fan,
  Monitor,
  MousePointer,
  Laptop,
  HelpCircle,
  Copy,
} from 'lucide-react';

interface PcBuilderPageProps {
  storeId: string;
  storeName: string;
  currencySymbol: string;
  onLoadBuildToCart: (parts: ProductLocal[]) => void;
}

// Categories that allow equipping multiple components simultaneously (e.g. CPU Cooler + Case Fans + Thermal Paste, NVMe + SATA SSD/HDD, Mouse + Keyboard + Headset)
const MULTI_SLOT_CATEGORIES = new Set<HardwareCategory>([
  'Cooling',
  'Storage',
  'Peripheral',
  'Monitor',
]);

export function PcBuilderPage({
  storeId,
  storeName,
  currencySymbol,
  onLoadBuildToCart,
}: PcBuilderPageProps) {
  // Currently active hardware category being browsed
  const [activeCategory, setActiveCategory] = useState<HardwareCategory>('CPU');
  const [categorySearch, setCategorySearch] = useState('');
  const [sortBy, setSortBy] = useState<
    'featured' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'
  >('featured');
  const [selectedBrand, setSelectedBrand] = useState<string>('All');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Selected hardware item IDs per slot (supports multi-install for Cooling, Storage, Peripheral, Monitor)
  const [selectedBySlot, setSelectedBySlot] = useState<
    Partial<Record<HardwareCategory, string[]>>
  >({});
  const [customerName, setCustomerName] = useState('');
  const [bundleDiscount, setBundleDiscount] = useState('0');
  const [activeQuote, setActiveQuote] = useState<QuoteBuildData | null>(null);
  const [copiedBuild, setCopiedBuild] = useState(false);

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

  const productsByCategory = useMemo(() => {
    const map = new Map<HardwareCategory, ProductLocal[]>();
    for (const cat of HARDWARE_CATEGORIES) {
      map.set(cat, []);
    }
    for (const p of products) {
      const cat = p.category || 'Peripheral';
      const list = map.get(cat) || [];
      list.push(p);
      map.set(cat, list);
    }
    return map;
  }, [products]);

  const resolvedBuild = useMemo(() => {
    const record: Partial<Record<HardwareCategory, ProductLocal | ProductLocal[]>> = {};
    const list: Array<{ slot: HardwareCategory; product: ProductLocal }> = [];
    for (const cat of HARDWARE_CATEGORIES) {
      const pids = selectedBySlot[cat];
      if (!pids || pids.length === 0) continue;
      const foundList: ProductLocal[] = [];
      for (const pid of pids) {
        const found = products.find((p) => p.id === pid);
        if (found) {
          foundList.push(found);
          list.push({ slot: cat, product: found });
        }
      }
      if (foundList.length > 0) {
        record[cat] = MULTI_SLOT_CATEGORIES.has(cat) ? foundList : foundList[0];
      }
    }
    return { record, list };
  }, [selectedBySlot, products]);

  const compatibility = useMemo(() => {
    return analyzePcBuildCompatibility(resolvedBuild.record);
  }, [resolvedBuild.record]);

  const subtotal = useMemo(() => {
    return resolvedBuild.list.reduce((sum, item) => sum + (item.product.price || 0), 0);
  }, [resolvedBuild.list]);

  const discountNum = Math.min(subtotal, Math.max(0, parseFloat(bundleDiscount) || 0));
  const totalAmount = Math.max(0, subtotal - discountNum);

  // Quick preset loader
  const handleAutoPreset = (platform: 'AM5' | 'LGA1700') => {
    const next: Partial<Record<HardwareCategory, string[]>> = {};
    const cpu = products.find(
      (p) => p.category === 'CPU' && p.specs?.socket?.toUpperCase() === platform
    );
    const mobo = products.find(
      (p) => p.category === 'Motherboard' && p.specs?.socket?.toUpperCase() === platform
    );
    const targetRamType = mobo?.specs?.ramType || (platform === 'AM5' ? 'DDR5' : 'DDR4');
    const ram = products.find(
      (p) => p.category === 'RAM' && p.specs?.ramType?.toUpperCase() === targetRamType.toUpperCase()
    );
    const gpu = products.find((p) => p.category === 'GPU');
    const storage = products.find((p) => p.category === 'Storage');
    const psu = products.find((p) => p.category === 'PSU');
    const pcCase = products.find((p) => p.category === 'Case');
    const cooler = products.find(
      (p) =>
        p.category === 'Cooling' &&
        !p.name.toLowerCase().includes('case fan') &&
        !p.name.toLowerCase().includes('thermal paste')
    );
    const caseFans = products.find(
      (p) => p.category === 'Cooling' && p.name.toLowerCase().includes('case fan')
    );

    if (cpu) next.CPU = [cpu.id];
    if (mobo) next.Motherboard = [mobo.id];
    if (ram) next.RAM = [ram.id];
    if (gpu) next.GPU = [gpu.id];
    if (storage) next.Storage = [storage.id];
    if (psu) next.PSU = [psu.id];
    if (pcCase) next.Case = [pcCase.id];
    if (cooler || caseFans) {
      next.Cooling = [cooler?.id, caseFans?.id].filter((id): id is string => Boolean(id));
    }

    setSelectedBySlot(next);
  };

  const handleSelectPart = (cat: HardwareCategory, productId: string) => {
    setSelectedBySlot((prev) => {
      const current = prev[cat] || [];
      if (MULTI_SLOT_CATEGORIES.has(cat)) {
        if (current.includes(productId)) return prev;
        return {
          ...prev,
          [cat]: [...current, productId],
        };
      }
      return {
        ...prev,
        [cat]: [productId],
      };
    });
  };

  const handleRemovePart = (cat: HardwareCategory, productId?: string) => {
    setSelectedBySlot((prev) => {
      const next = { ...prev };
      if (!productId || !next[cat]) {
        delete next[cat];
        return next;
      }
      const filtered = next[cat]!.filter((id) => id !== productId);
      if (filtered.length === 0) {
        delete next[cat];
      } else {
        next[cat] = filtered;
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
      `MEGAHERTZ DEPOT — CUSTOM PC RIG QUOTATION (${storeName})`,
      `Client: ${customerName.trim() || 'Walk-in PC Builder'}`,
      `Compatibility: ${compatibility.isCompatible ? 'VERIFIED' : 'CHECK WARNINGS'} (${compatibility.estimatedSystemWatts}W Est. Load | Rec. PSU: ${compatibility.recommendedPsuWatts}W+)`,
      '--------------------------------------------',
      ...resolvedBuild.list.map(
        ({ slot, product }) =>
          `[${slot}] ${product.name} — ${formatCurrency(product.price || 0, currencySymbol)}`
      ),
      '--------------------------------------------',
      `Quoted Total: ${formatCurrency(totalAmount, currencySymbol)}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedBuild(true);
      setTimeout(() => setCopiedBuild(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Available brands in the currently active category
  const activeCategoryBrands = useMemo(() => {
    const list = productsByCategory.get(activeCategory) || [];
    const brands = new Set<string>();
    for (const p of list) {
      if (p.brand && p.brand.trim()) {
        brands.add(p.brand.trim());
      }
    }
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [productsByCategory, activeCategory]);

  // Filter & sort products for active category browser
  const activeCategoryProducts = useMemo(() => {
    const list = productsByCategory.get(activeCategory) || [];
    const q = categorySearch.trim().toLowerCase();

    return list
      .filter((p) => {
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
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return (a.price ?? 0) - (b.price ?? 0);
        if (sortBy === 'price-desc') return (b.price ?? 0) - (a.price ?? 0);
        if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
        return 0; // 'featured' preserves catalog order
      });
  }, [
    productsByCategory,
    activeCategory,
    categorySearch,
    sortBy,
    selectedBrand,
    inStockOnly,
    stockByProduct,
  ]);

  // Helper to check individual part compatibility note relative to current build
  const getPartCompatibilityNote = (part: ProductLocal) => {
    const firstPart = (val?: ProductLocal | ProductLocal[]) =>
      Array.isArray(val) ? val[0] : val;
    const selectedCpu = firstPart(resolvedBuild.record.CPU);
    const selectedMobo = firstPart(resolvedBuild.record.Motherboard);
    const selectedRam = firstPart(resolvedBuild.record.RAM);

    // Check CPU compatibility with selected Mobo
    if (part.category === 'CPU' && selectedMobo?.specs?.socket && part.specs?.socket) {
      const match = part.specs.socket.toUpperCase() === selectedMobo.specs.socket.toUpperCase();
      return {
        isMatch: match,
        text: match
          ? `Matches ${selectedMobo.specs.socket} Socket`
          : `Requires ${selectedMobo.specs.socket} socket (part has ${part.specs.socket})`,
      };
    }

    // Check Mobo compatibility with CPU
    if (part.category === 'Motherboard' && selectedCpu?.specs?.socket && part.specs?.socket) {
      const match = part.specs.socket.toUpperCase() === selectedCpu.specs.socket.toUpperCase();
      return {
        isMatch: match,
        text: match
          ? `Matches ${selectedCpu.specs.socket} CPU Socket`
          : `Requires ${selectedCpu.specs.socket} CPU (part has ${part.specs.socket})`,
      };
    }

    // Check Mobo compatibility with selected RAM
    if (part.category === 'Motherboard' && selectedRam?.specs?.ramType && part.specs?.ramType) {
      const match = part.specs.ramType.toUpperCase() === selectedRam.specs.ramType.toUpperCase();
      if (!match) {
        return {
          isMatch: false,
          text: `Selected RAM is ${selectedRam.specs.ramType}, but board requires ${part.specs.ramType}`,
        };
      }
    }

    // Check RAM compatibility with Mobo
    if (part.category === 'RAM' && selectedMobo?.specs?.ramType && part.specs?.ramType) {
      const match = part.specs.ramType.toUpperCase() === selectedMobo.specs.ramType.toUpperCase();
      return {
        isMatch: match,
        text: match
          ? `Matches ${selectedMobo.specs.ramType} Memory Generation`
          : `Requires ${selectedMobo.specs.ramType} (part is ${part.specs.ramType})`,
      };
    }

    return null;
  };

  const getCategoryIcon = (cat: HardwareCategory) => {
    switch (cat) {
      case 'CPU':
        return <Cpu className="w-5 h-5 text-amber-400" />;
      case 'Motherboard':
        return <Server className="w-5 h-5 text-amber-400" />;
      case 'RAM':
        return <Layers className="w-5 h-5 text-amber-400" />;
      case 'GPU':
        return <Sparkles className="w-5 h-5 text-amber-400" />;
      case 'Storage':
        return <HardDrive className="w-5 h-5 text-amber-400" />;
      case 'PSU':
        return <Zap className="w-5 h-5 text-amber-400" />;
      case 'Cooling':
        return <Fan className="w-5 h-5 text-amber-400" />;
      case 'Case':
        return <Box className="w-5 h-5 text-amber-400" />;
      case 'Monitor':
        return <Monitor className="w-5 h-5 text-amber-400" />;
      case 'Peripheral':
        return <MousePointer className="w-5 h-5 text-amber-400" />;
      case 'Laptop':
        return <Laptop className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Controls & Presets Header */}
      <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-400" />
            <span>Interactive Visual PC Rig Builder</span>
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Hover or click components on the PC silhouette to inspect slots and fit hardware with
            real-time compatibility checking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAutoPreset('AM5')}
            data-testid="preset-am5-btn"
            className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>AM5 DDR5 Preset</span>
          </button>
          <button
            type="button"
            onClick={() => handleAutoPreset('LGA1700')}
            className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-stone-300" />
            <span>Intel LGA1700 Preset</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedBySlot({})}
            className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-400 hover:text-white cursor-pointer transition"
            title="Reset Build"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main 2-Column Visual Rig Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left 6 Columns: Interactive PC Rig Silhouette */}
        <div className="lg:col-span-6 xl:col-span-5 space-y-4">
          <PcRigSilhouette
            selectedParts={resolvedBuild.record}
            activeCategory={activeCategory}
            onSelectCategory={(cat) => {
              setActiveCategory(cat);
              setCategorySearch('');
              setSelectedBrand('All');
            }}
            onRemovePart={handleRemovePart}
            currencySymbol={currencySymbol}
          />
        </div>

        {/* Right 6 Columns: Focused Hardware Component Browser */}
        <div className="lg:col-span-6 xl:col-span-7 space-y-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4">
            {/* Browser Header */}
            <div className="space-y-3 border-b border-stone-800 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 shrink-0">
                  {getCategoryIcon(activeCategory)}
                </div>
                <div className="space-y-1 min-w-0">
                  <h3 className="font-bold text-white text-base flex flex-wrap items-center gap-2">
                    <span>Select {activeCategory} Component</span>
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-stone-950 text-stone-300 border border-stone-800">
                      {activeCategoryProducts.length} in inventory
                    </span>
                    {MULTI_SLOT_CATEGORIES.has(activeCategory) && (
                      <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Multi-Slot Enabled
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {activeCategory === 'Cooling'
                      ? 'You can install multiple cooling components (e.g. CPU Air/AIO Cooler + Case Fans + Thermal Paste)'
                      : MULTI_SLOT_CATEGORIES.has(activeCategory)
                      ? `You can install multiple ${activeCategory.toLowerCase()} items simultaneously in your build`
                      : 'Click "Install" to slot into your PC chassis build'}
                  </p>
                </div>
              </div>

              {/* Dedicated Toolbar Row: Quick Search, Sort & Filters */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                  <input
                    type="text"
                    placeholder={`Search ${activeCategory} by name, brand, or specs...`}
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Brand Filter Dropdown */}
                {activeCategoryBrands.length > 1 && (
                  <select
                    aria-label="Filter by brand"
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="All">All Brands</option>
                    {activeCategoryBrands.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                )}

                {/* Sort Dropdown (Price Low/High & Name A-Z/Z-A) */}
                <select
                  aria-label="Sort components"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as
                        | 'featured'
                        | 'price-asc'
                        | 'price-desc'
                        | 'name-asc'
                        | 'name-desc'
                    )
                  }
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="featured">Sort: Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                </select>

                {/* In-Stock Toggle Button */}
                <button
                  type="button"
                  onClick={() => setInStockOnly((v) => !v)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    inStockOnly
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                  }`}
                  title="Show only in-stock components"
                >
                  In Stock
                </button>
              </div>
            </div>

            {/* Currently Installed Part(s) for this Slot Banner */}
            {resolvedBuild.list.some((item) => item.slot === activeCategory) && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                {resolvedBuild.list
                  .filter((item) => item.slot === activeCategory)
                  .map(({ product: installedPart }, idx) => (
                    <div
                      key={installedPart.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="min-w-0 space-y-0.5">
                          <span className="font-bold text-white text-xs sm:text-sm block leading-snug">
                            {MULTI_SLOT_CATEGORIES.has(activeCategory)
                              ? `Installed #${idx + 1}: ${installedPart.name}`
                              : `Installed: ${installedPart.name}`}
                          </span>
                          <span className="font-mono text-amber-400 font-bold text-xs block">
                            {formatCurrency(installedPart.price || 0, currencySymbol)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePart(activeCategory, installedPart.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-rose-400 text-xs font-semibold shrink-0 transition cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {/* Product Items List / Cards */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1.5">
              {activeCategoryProducts.length === 0 ? (
                <div className="p-8 text-center text-stone-500 space-y-2">
                  <HelpCircle className="w-8 h-8 text-stone-600 mx-auto" />
                  <p className="text-sm font-semibold text-stone-400">
                    No components found in {activeCategory} category
                  </p>
                  <p className="text-xs text-stone-500">
                    Clear your search term or add products in the Admin catalog.
                  </p>
                </div>
              ) : (
                activeCategoryProducts.map((product) => {
                  const isSelected = Boolean(
                    selectedBySlot[activeCategory]?.includes(product.id)
                  );
                  const stock = stockByProduct.get(product.id) ?? 0;
                  const isOutOfStock = stock <= 0;
                  const compatNote = getPartCompatibilityNote(product);

                  return (
                    <div
                      key={product.id}
                      className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500 shadow-md shadow-amber-950/20'
                          : 'bg-stone-950 border-stone-800 hover:border-stone-700'
                      }`}
                    >
                      {/* Product Thumbnail & Details */}
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                        <ProductImage
                          imageUrl={product.imageUrl}
                          name={product.name}
                          category={product.category}
                          className="w-14 h-14 rounded-xl shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="font-bold text-white text-sm leading-snug">
                              {product.name}
                            </span>
                            {product.brand && (
                              <span className="text-xs text-stone-400 shrink-0 font-medium">
                                • {product.brand}
                              </span>
                            )}
                          </div>

                          {/* Specs Chips */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {product.specs?.socket && (
                              <span className="px-2 py-0.5 rounded-md bg-stone-800 text-stone-200 font-mono text-[11px] border border-stone-700">
                                {product.specs.socket}
                              </span>
                            )}
                            {product.specs?.ramType && (
                              <span className="px-2 py-0.5 rounded-md bg-stone-800 text-stone-200 font-mono text-[11px] border border-stone-700">
                                {product.specs.ramType}
                              </span>
                            )}
                            {product.specs?.formFactor && (
                              <span className="px-2 py-0.5 rounded-md bg-stone-800 text-stone-200 font-mono text-[11px] border border-stone-700">
                                {product.specs.formFactor}
                              </span>
                            )}
                            {product.specs?.wattage ? (
                              <span className="px-2 py-0.5 rounded-md bg-stone-800 text-stone-200 font-mono text-[11px] border border-stone-700">
                                {product.specs.wattage}W
                              </span>
                            ) : null}
                            <span
                              className={`font-mono text-xs ${
                                isOutOfStock ? 'text-rose-400' : 'text-stone-400'
                              }`}
                            >
                              ({stock} in stock)
                            </span>
                          </div>

                          {/* Real-time compatibility notice tag */}
                          {compatNote && (
                            <div
                              className={`text-xs font-semibold flex items-center gap-1.5 pt-0.5 ${
                                compatNote.isMatch ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {compatNote.isMatch ? (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{compatNote.text}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Price & Action Button */}
                      <div className="flex items-center justify-between sm:justify-end gap-3.5 shrink-0 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-stone-800/80">
                        <span className="text-base font-extrabold text-amber-400 font-mono">
                          {formatCurrency(product.price || 0, currencySymbol)}
                        </span>

                        {isSelected ? (
                          <button
                            type="button"
                            onClick={() => handleRemovePart(activeCategory, product.id)}
                            className="px-3.5 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Check className="w-4 h-4" />
                            <span>Installed</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectPart(activeCategory, product.id)}
                            className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 active:scale-95 text-stone-200 hover:text-white border border-stone-700 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
                          >
                            <span>Install</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Summary Bar: Compatibility Matrix, Wattage & Order Quote */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Box 1: Live Compatibility Status Box */}
        <div
          data-testid="compatibility-status-box"
          className={`p-4 rounded-2xl border text-xs space-y-2 flex flex-col justify-between ${
            compatibility.isCompatible
              ? 'bg-stone-900/90 border-stone-800 text-stone-200'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-xs">
              {compatibility.isCompatible ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Build Compatibility Verified</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Compatibility Conflict Detected!</span>
                </>
              )}
            </div>

            {compatibility.errors.map((err, i) => (
              <p key={i} className="text-[11px] text-rose-300 leading-relaxed">
                • {err}
              </p>
            ))}

            {compatibility.warnings.map((warn, i) => (
              <p key={i} className="text-[11px] text-amber-300 leading-relaxed">
                • {warn}
              </p>
            ))}

            {compatibility.isCompatible && compatibility.errors.length === 0 && (
              <p className="text-[11px] text-stone-400">
                Socket standards and memory generations align. Hardware is ready for assembly.
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-stone-800/80 text-[10px] text-stone-500">
            Validated against ATX / AM5 / LGA1700 spec matrix.
          </div>
        </div>

        {/* Box 2: Wattage Estimator */}
        <div className="p-4 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-2.5 text-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-stone-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Est. System Load
              </span>
              <span className="font-mono font-bold text-white text-sm">
                {compatibility.estimatedSystemWatts}W
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-stone-400">Recommended PSU (+25%)</span>
              <span className="font-mono text-amber-400 font-bold">
                {compatibility.recommendedPsuWatts}W+
              </span>
            </div>

            {compatibility.selectedPsuWatts !== null && (
              <div className="flex items-center justify-between pt-1 border-t border-stone-800">
                <span className="text-stone-400">Selected PSU Capacity</span>
                <span className="font-mono text-white font-bold">
                  {compatibility.selectedPsuWatts}W
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-stone-800">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Client / Rig Name (Optional)"
                className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1 text-[11px] text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
              />
              <input
                type="number"
                min={0}
                value={bundleDiscount}
                onChange={(e) => setBundleDiscount(e.target.value)}
                placeholder="Discount"
                title="Bundle discount"
                className="w-24 bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Box 3: Total & Actions */}
        <div className="p-4 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-stone-400">
              <span>Selected Components ({resolvedBuild.list.length})</span>
              <span className="font-mono">{formatCurrency(subtotal, currencySymbol)}</span>
            </div>
            {discountNum > 0 && (
              <div className="flex justify-between text-xs text-amber-400 font-semibold">
                <span>Bundle Discount</span>
                <span className="font-mono">-{formatCurrency(discountNum, currencySymbol)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1.5 border-t border-stone-800">
              <span className="text-xs font-bold text-stone-300">Quoted Total:</span>
              <span className="text-lg font-black text-amber-400 font-mono">
                {formatCurrency(totalAmount, currencySymbol)}
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={resolvedBuild.list.length === 0}
              onClick={() => onLoadBuildToCart(resolvedBuild.list.map((i) => i.product))}
              data-testid="load-build-to-cart-btn"
              className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-amber-950/40 cursor-pointer transition"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Add Rig to Order Cart</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={resolvedBuild.list.length === 0}
                onClick={handleOpenQuote}
                data-testid="generate-quote-btn"
                className="w-full py-2 px-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition border border-stone-700"
              >
                <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Printable Quote</span>
              </button>

              <button
                type="button"
                disabled={resolvedBuild.list.length === 0}
                onClick={handleCopyBuildList}
                className="w-full py-2 px-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition border border-stone-700"
              >
                {copiedBuild ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300">Copied Specs!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Copy Build List</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ReceiptQuoteModal
        open={Boolean(activeQuote)}
        onClose={() => setActiveQuote(null)}
        storeName={storeName}
        currencySymbol={currencySymbol}
        quote={activeQuote}
      />
    </div>
  );
}
