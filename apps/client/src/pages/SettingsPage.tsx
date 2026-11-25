import React, { useState, useEffect } from 'react';
import { localDb } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import { useColorScheme, ColorSchemePreference } from '../hooks/useColorScheme.js';
import {
  Store,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Bell,
  UserPlus,
  Plus,
  Lock,
  Coins,
  Download,
  Upload,
  Database,
  PackagePlus,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

interface StoreOption {
  id: string;
  name: string;
  role?: string;
}

interface SettingsPageProps {
  user: { id: string; email: string };
  currentStoreId: string;
  stores: StoreOption[];
  onSelectStore: (storeId: string) => void;
  onCreateStore: (name: string) => Promise<void>;
  lowStockThreshold: number;
  onChangeLowStockThreshold: (val: number) => void;
  currencySymbol: string;
  onChangeCurrencySymbol: (sym: string) => void;
  isStoragePersisted: boolean;
}

export function SettingsPage({
  user,
  currentStoreId,
  stores,
  onSelectStore,
  onCreateStore,
  lowStockThreshold,
  onChangeLowStockThreshold,
  currencySymbol,
  onChangeCurrencySymbol,
  isStoragePersisted,
}: SettingsPageProps) {
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const { preference: themePreference, systemScheme, setPreference: setThemePreference } =
    useColorScheme();

  useEffect(() => {
    localRepository.getDeviceId().then(setDeviceId);
    localRepository.getDeviceName().then(setDeviceName);
  }, []);

  const showTempStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleSaveDeviceName = async (e: React.FormEvent) => {
    e.preventDefault();
    await localRepository.setDeviceName(deviceName);
    showTempStatus('Terminal label saved locally.');
  };

  const handleCreateNewStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    await onCreateStore(newStoreName.trim());
    setNewStoreName('');
    showTempStatus('New store branch created and activated.');
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      const token = localStorage.getItem('countwise_token');
      const res = await fetch(`/stores/${currentStoreId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add member');
      setInviteEmail('');
      showTempStatus(`Added ${data.member.email} to store!`);
    } catch (err: any) {
      showTempStatus(err.message || 'Could not invite member while offline');
    }
  };

  const handleExportSnapshot = async () => {
    setSnapshotBusy(true);
    try {
      const [products, adjustments, orders, productImages] = await Promise.all([
        localDb.products.where('storeId').equals(currentStoreId).toArray(),
        localDb.adjustments.where('storeId').equals(currentStoreId).toArray(),
        localDb.orders.where('storeId').equals(currentStoreId).toArray(),
        localDb.productImages.toArray(),
      ]);

      const snapshot = {
        version: 1,
        exportedAt: new Date().toISOString(),
        storeId: currentStoreId,
        currencySymbol,
        lowStockThreshold,
        counts: {
          products: products.length,
          adjustments: adjustments.length,
          orders: orders.length,
          productImages: productImages.length,
        },
        data: {
          products,
          adjustments,
          orders,
          productImages,
        },
      };

      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `megahertz-demo-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showTempStatus(
        `Exported snapshot: ${products.length} products, ${productImages.length} local images, and ${orders.length} receipts.`
      );
    } catch (err: any) {
      showTempStatus(err?.message || 'Failed to export local snapshot.');
    } finally {
      setSnapshotBusy(false);
    }
  };

  const handleImportSnapshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showTempStatus('Snapshot file exceeds 15MB size limit.');
      e.target.value = '';
      return;
    }
    setSnapshotBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = parsed?.data;
      if (!data || !Array.isArray(data.products)) {
        throw new Error('Invalid snapshot file format.');
      }

      const SAFE_DATA_IMAGE_RE = /^data:image\/(webp|png|jpeg|gif);base64,/i;
      const isSafeSnapshotUrl = (url: unknown): url is string => {
        if (typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.length > 2000) return false;
        return (
          trimmed.startsWith('/') ||
          trimmed.startsWith('https://') ||
          trimmed.startsWith('http://') ||
          trimmed.startsWith('local-img://')
        );
      };

      let restoredImages = 0;
      let restoredProducts = 0;
      let restoredAdjustments = 0;
      let restoredOrders = 0;

      await localDb.transaction(
        'rw',
        [localDb.products, localDb.adjustments, localDb.orders, localDb.productImages],
        async () => {
          if (Array.isArray(data.productImages)) {
            for (const img of data.productImages) {
              if (
                img &&
                typeof img.id === 'string' &&
                img.id.trim() &&
                typeof img.dataUrl === 'string' &&
                SAFE_DATA_IMAGE_RE.test(img.dataUrl.trim())
              ) {
                await localDb.productImages.put({
                  id: img.id.trim(),
                  dataUrl: img.dataUrl.trim(),
                  mimeType:
                    typeof img.mimeType === 'string' ? img.mimeType : 'image/webp',
                  size:
                    typeof img.size === 'number' && Number.isFinite(img.size)
                      ? img.size
                      : img.dataUrl.length,
                  fileName: typeof img.fileName === 'string' ? img.fileName : undefined,
                  createdAt:
                    typeof img.createdAt === 'number' && Number.isFinite(img.createdAt)
                      ? img.createdAt
                      : Date.now(),
                });
                restoredImages++;
              }
            }
          }
          if (Array.isArray(data.products)) {
            for (const prod of data.products) {
              if (
                prod &&
                typeof prod.id === 'string' &&
                prod.id.trim() &&
                typeof prod.name === 'string' &&
                prod.name.trim()
              ) {
                await localDb.products.put({
                  id: prod.id.trim(),
                  storeId: currentStoreId,
                  name: prod.name.trim().slice(0, 255),
                  sku: typeof prod.sku === 'string' ? prod.sku.slice(0, 100) : undefined,
                  category: typeof prod.category === 'string' ? prod.category : 'Peripheral',
                  brand: typeof prod.brand === 'string' ? prod.brand.slice(0, 100) : undefined,
                  price: typeof prod.price === 'number' && Number.isFinite(prod.price) ? prod.price : 0,
                  costPrice:
                    typeof prod.costPrice === 'number' && Number.isFinite(prod.costPrice)
                      ? prod.costPrice
                      : undefined,
                  warranty: typeof prod.warranty === 'string' ? prod.warranty.slice(0, 120) : undefined,
                  specs: prod.specs && typeof prod.specs === 'object' ? prod.specs : undefined,
                  imageUrl: isSafeSnapshotUrl(prod.imageUrl) ? prod.imageUrl.trim() : undefined,
                  publicStock:
                    typeof prod.publicStock === 'number' && Number.isFinite(prod.publicStock)
                      ? prod.publicStock
                      : undefined,
                  nameHlc:
                    typeof prod.nameHlc === 'string' && prod.nameHlc.trim()
                      ? prod.nameHlc
                      : '000000000000000:000000:snapshot',
                  skuHlc: typeof prod.skuHlc === 'string' ? prod.skuHlc : undefined,
                  priceHlc: typeof prod.priceHlc === 'string' ? prod.priceHlc : undefined,
                  imageHlc: typeof prod.imageHlc === 'string' ? prod.imageHlc : undefined,
                  deletedAt:
                    typeof prod.deletedAt === 'number' && Number.isFinite(prod.deletedAt)
                      ? prod.deletedAt
                      : undefined,
                  deletedHlc: typeof prod.deletedHlc === 'string' ? prod.deletedHlc : undefined,
                  serverSeq:
                    typeof prod.serverSeq === 'number' && Number.isFinite(prod.serverSeq)
                      ? prod.serverSeq
                      : undefined,
                });
                restoredProducts++;
              }
            }
          }
          if (Array.isArray(data.adjustments)) {
            for (const adj of data.adjustments) {
              if (
                adj &&
                typeof adj.id === 'string' &&
                adj.id.trim() &&
                typeof adj.productId === 'string' &&
                adj.productId.trim() &&
                typeof adj.delta === 'number' &&
                Number.isFinite(adj.delta)
              ) {
                await localDb.adjustments.put({
                  id: adj.id.trim(),
                  productId: adj.productId.trim(),
                  storeId: currentStoreId,
                  delta: Math.trunc(adj.delta),
                  reason:
                    adj.reason === 'count' ||
                    adj.reason === 'sale' ||
                    adj.reason === 'restock' ||
                    adj.reason === 'damage'
                      ? adj.reason
                      : 'other',
                  countedPhysical:
                    typeof adj.countedPhysical === 'number' ? adj.countedPhysical : undefined,
                  localStockAtCount:
                    typeof adj.localStockAtCount === 'number' ? adj.localStockAtCount : undefined,
                  createdAt:
                    typeof adj.createdAt === 'number' && Number.isFinite(adj.createdAt)
                      ? adj.createdAt
                      : Date.now(),
                  hlc:
                    typeof adj.hlc === 'string' && adj.hlc.trim()
                      ? adj.hlc
                      : '000000000000000:000000:snapshot',
                  deviceId: typeof adj.deviceId === 'string' ? adj.deviceId : 'snapshot',
                  userId: typeof adj.userId === 'string' ? adj.userId : user.id,
                });
                restoredAdjustments++;
              }
            }
          }
          if (Array.isArray(data.orders)) {
            for (const ord of data.orders) {
              if (
                ord &&
                typeof ord.id === 'string' &&
                ord.id.trim() &&
                Array.isArray(ord.items)
              ) {
                await localDb.orders.put({
                  id: ord.id.trim(),
                  storeId: currentStoreId,
                  receiptNumber:
                    typeof ord.receiptNumber === 'string' ? ord.receiptNumber : 'MHD-SNAPSHOT',
                  customerName:
                    typeof ord.customerName === 'string' ? ord.customerName : undefined,
                  customerPhone:
                    typeof ord.customerPhone === 'string' ? ord.customerPhone : undefined,
                  items: ord.items,
                  subtotal: typeof ord.subtotal === 'number' ? ord.subtotal : 0,
                  discountAmount: typeof ord.discountAmount === 'number' ? ord.discountAmount : 0,
                  taxRate: typeof ord.taxRate === 'number' ? ord.taxRate : 12,
                  taxInclusive: typeof ord.taxInclusive === 'boolean' ? ord.taxInclusive : true,
                  taxAmount: typeof ord.taxAmount === 'number' ? ord.taxAmount : 0,
                  totalAmount: typeof ord.totalAmount === 'number' ? ord.totalAmount : 0,
                  paymentMethod:
                    ord.paymentMethod === 'Cash' ||
                    ord.paymentMethod === 'GCash' ||
                    ord.paymentMethod === 'Maya' ||
                    ord.paymentMethod === 'Card' ||
                    ord.paymentMethod === 'Split'
                      ? ord.paymentMethod
                      : 'Cash',
                  amountTendered:
                    typeof ord.amountTendered === 'number' ? ord.amountTendered : 0,
                  changeDue: typeof ord.changeDue === 'number' ? ord.changeDue : 0,
                  notes: typeof ord.notes === 'string' ? ord.notes : undefined,
                  createdAt:
                    typeof ord.createdAt === 'number' && Number.isFinite(ord.createdAt)
                      ? ord.createdAt
                      : Date.now(),
                  hlc:
                    typeof ord.hlc === 'string' && ord.hlc.trim()
                      ? ord.hlc
                      : '000000000000000:000000:snapshot',
                  deviceId: typeof ord.deviceId === 'string' ? ord.deviceId : 'snapshot',
                  userId: typeof ord.userId === 'string' ? ord.userId : user.id,
                  serverSeq:
                    typeof ord.serverSeq === 'number' && Number.isFinite(ord.serverSeq)
                      ? ord.serverSeq
                      : undefined,
                });
                restoredOrders++;
              }
            }
          }
        }
      );

      showTempStatus(
        `Restored ${restoredProducts} products, ${restoredImages} local images, ${restoredAdjustments} adjustments, and ${restoredOrders} receipts!`
      );
    } catch (err: any) {
      showTempStatus(err?.message || 'Failed to import snapshot file.');
    } finally {
      setSnapshotBusy(false);
      e.target.value = '';
    }
  };

  const handleReseedCatalog = async () => {
    setSnapshotBusy(true);
    try {
      const count = await localRepository.seedSampleHardwareCatalog(currentStoreId, user.id);
      showTempStatus(
        count > 0
          ? `Seeded ${count} missing sample PC hardware item(s) to this branch!`
          : 'All 142 sample PC hardware items are already present in this branch.'
      );
    } finally {
      setSnapshotBusy(false);
    }
  };

  const themeOptions: Array<{
    value: ColorSchemePreference;
    label: string;
    detail: string;
    icon: typeof Monitor;
    testId: string;
  }> = [
    {
      value: 'system',
      label: `System (Currently ${systemScheme === 'dark' ? 'Dark' : 'Light'})`,
      detail: 'Follow your device color scheme automatically',
      icon: Monitor,
      testId: 'theme-pref-system',
    },
    {
      value: 'light',
      label: 'Light',
      detail: 'Precision retail zinc & warm paper surfaces',
      icon: Sun,
      testId: 'theme-pref-light',
    },
    {
      value: 'dark',
      label: 'Dark',
      detail: 'Carbon precision zinc (#09090b) & CAD night mode',
      icon: Moon,
      testId: 'theme-pref-dark',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {statusMsg && (
        <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-medium">
          {statusMsg}
        </div>
      )}

      {/* Store Picker & Multi-Store Management */}
      <section className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800">
        <div className="px-5 py-4 flex items-center gap-2">
          <Store className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Branch Selection & Team Access
          </h3>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div className="min-w-0">
            <label
              htmlFor="settings-active-branch"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Active Store Branch
            </label>
            <select
              id="settings-active-branch"
              value={currentStoreId}
              onChange={(e) => onSelectStore(e.target.value)}
              className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-sm text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id} className="bg-white dark:bg-carbon">
                  {s.name} ({s.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleCreateNewStore} className="min-w-0">
            <label
              htmlFor="settings-new-branch"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Create Additional Branch
            </label>
            <div className="flex items-center gap-2 min-w-0">
              <input
                id="settings-new-branch"
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="e.g. Gilmore Flagship / Mall Kiosk"
                className="min-w-0 flex-1 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
              />
              <button
                type="submit"
                className="shrink-0 px-3.5 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                <span>Create</span>
              </button>
            </div>
          </form>
        </div>

        <form onSubmit={handleInviteStaff} className="p-5 min-w-0">
          <label
            htmlFor="settings-invite-email"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" strokeWidth={1.75} />
            <span>Add Cashier or Technician to Active Branch (by registered email)</span>
          </label>
          <div className="flex items-center gap-2 min-w-0">
            <input
              id="settings-invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="cashier2@megahertzdepot.com"
              className="min-w-0 flex-1 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
            />
            <button
              type="submit"
              className="shrink-0 px-4 py-2 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold cursor-pointer transition-colors"
            >
              Add Member
            </button>
          </div>
        </form>
      </section>

      {/* Appearance & Color Scheme Selector (3 explicit states) */}
      <section className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800">
        <div className="px-5 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Appearance & Color Theme
            </h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
            Active: {themePreference}
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const active = themePreference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                data-testid={opt.testId}
                aria-pressed={active}
                onClick={() => setThemePreference(opt.value)}
                className={`p-3 rounded-md border text-left transition-colors cursor-pointer space-y-1 ${
                  active
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-zinc-950 dark:text-zinc-50'
                    : 'bg-zinc-50 dark:bg-carbon-elevated border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Icon
                    className={`w-4 h-4 ${active ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}
                    strokeWidth={1.75}
                  />
                  <span>{opt.label}</span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                  {opt.detail}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Terminal Identity, Currency & Threshold */}
      <section className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              POS Terminal & Store Preferences
            </h3>
          </div>
          {deviceId && (
            <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded">
              Node: <code className="text-zinc-950 dark:text-zinc-50 font-semibold">{deviceId}</code>
            </span>
          )}
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <form onSubmit={handleSaveDeviceName} className="space-y-1.5 min-w-0">
            <label
              htmlFor="settings-terminal-label"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate"
            >
              Terminal Label
            </label>
            <div className="flex items-center gap-2 min-w-0">
              <input
                id="settings-terminal-label"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="min-w-0 flex-1 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-sm text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
              />
              <button
                type="submit"
                className="shrink-0 px-3.5 py-2 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold cursor-pointer transition-colors"
              >
                Save
              </button>
            </div>
          </form>

          <div className="space-y-1.5 min-w-0">
            <label
              htmlFor="settings-currency"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 truncate"
            >
              <Coins className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" strokeWidth={1.75} />
              <span className="truncate">Store Currency Symbol</span>
            </label>
            <select
              id="settings-currency"
              value={currencySymbol}
              onChange={(e) => onChangeCurrencySymbol(e.target.value)}
              className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-sm text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
            >
              <option value="₱">₱ (PHP - Philippine Peso)</option>
              <option value="$">$ (USD - US Dollar)</option>
              <option value="€">€ (EUR - Euro)</option>
              <option value="£">£ (GBP - British Pound)</option>
              <option value="¥">¥ (JPY - Japanese Yen)</option>
            </select>
          </div>

          <div className="space-y-1.5 min-w-0">
            <label
              htmlFor="settings-low-stock"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 truncate"
            >
              <Bell className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" strokeWidth={1.75} />
              <span className="truncate">Low-Stock Alert Threshold</span>
            </label>
            <input
              id="settings-low-stock"
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(e) => onChangeLowStockThreshold(parseInt(e.target.value, 10) || 0)}
              className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3 py-2 text-sm text-zinc-950 dark:text-zinc-50 tabular-nums focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
            />
          </div>
        </div>
      </section>

      {/* Local Backup & Restore */}
      <section className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
            <Database className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
            <span>Local Backup, Restore & Sample Catalog</span>
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            Export your branch database (custom product photos, stock adjustments, and POS
            receipts) to a portable JSON file, or restore a saved backup on any terminal.
          </p>
        </div>

        <div className="p-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={snapshotBusy}
            onClick={handleExportSnapshot}
            data-testid="export-demo-snapshot-btn"
            className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" strokeWidth={1.75} />
            <span>Export Snapshot (.json)</span>
          </button>

          <label className="px-4 py-2 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
            <span>Restore Snapshot (.json)</span>
            <input
              type="file"
              accept=".json,application/json"
              disabled={snapshotBusy}
              onChange={handleImportSnapshot}
              className="hidden"
            />
          </label>

          <button
            type="button"
            disabled={snapshotBusy}
            onClick={handleReseedCatalog}
            className="px-3.5 py-2 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <PackagePlus className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
            <span>Reseed Missing Sample Hardware</span>
          </button>
        </div>
      </section>

      {/* Storage Persistence & Security Notes */}
      <section className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 space-y-3 text-xs">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
          {isStoragePersisted ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
          )}
          <span>Browser Storage & Offline Security Model</span>
        </h3>

        <div className="space-y-2 text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <p>
            <strong className="text-zinc-950 dark:text-zinc-50">Account:</strong> {user.email}
          </p>
          <p>
            <strong className="text-zinc-950 dark:text-zinc-50">Persistent Storage Status:</strong>{' '}
            {isStoragePersisted
              ? 'Granted (navigator.storage.persist() active, protected from automatic eviction).'
              : 'Best-effort storage (Browser did not grant explicit persistent lock; sync regularly on iOS/Safari).'}
          </p>
          <p className="flex items-start gap-2 text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-carbon-elevated p-3 rounded-md border border-zinc-200 dark:border-zinc-800">
            <Lock className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>
              <strong className="text-zinc-900 dark:text-zinc-100">Security Tradeoff:</strong> Local POS receipts and
              hardware inventory records in IndexedDB are stored unencrypted so the register can
              query, ring up sales, and aggregate deltas instantaneously while offline. Avoid shared
              public terminals without clearing site data after syncing.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
