import React, { useState, useEffect } from 'react';
import { localDb } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
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
  Sparkles,
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
    setSnapshotBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = parsed?.data;
      if (!data || !Array.isArray(data.products)) {
        throw new Error('Invalid snapshot file format.');
      }

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
                img.dataUrl.startsWith('data:image/')
              ) {
                await localDb.productImages.put(img);
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
                  ...prod,
                  storeId: currentStoreId,
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
                  ...adj,
                  storeId: currentStoreId,
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
                  ...ord,
                  storeId: currentStoreId,
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {statusMsg && (
        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800 text-amber-200 text-xs font-medium">
          {statusMsg}
        </div>
      )}

      {/* Store Picker & Multi-Store Management */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Store className="w-5 h-5 text-amber-400" />
          <span>MegaHertz Depot Branch & Team Membership</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Selected Store Branch
            </label>
            <select
              value={currentStoreId}
              onChange={(e) => onSelectStore(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleCreateNewStore} className="min-w-0">
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Create Additional Store Branch
            </label>
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="e.g. Gilmore Flagship / Mall Kiosk"
                className="min-w-0 flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="shrink-0 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shadow-md shadow-amber-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>Create</span>
              </button>
            </div>
          </form>
        </div>

        {/* Invite Staff Member to Store */}
        <form onSubmit={handleInviteStaff} className="pt-2 border-t border-stone-800 min-w-0">
          <label className="block text-xs font-medium text-stone-300 mb-1.5 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Add Cashier / Technician to Active Branch (by registered email)</span>
          </label>
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="cashier2@megahertzdepot.com"
              className="min-w-0 flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="shrink-0 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-xs font-semibold cursor-pointer"
            >
              Add Member
            </button>
          </div>
        </form>
      </div>

      {/* Device Identity, Currency & Low-Stock Threshold */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-400" />
            <span>POS Terminal Node & Store Preferences</span>
          </h3>
          {deviceId && (
            <span className="text-[11px] text-stone-400 font-mono bg-stone-900 border border-stone-800 px-2.5 py-1 rounded-lg">
              HLC Node: <code className="text-amber-400 font-semibold">{deviceId}</code>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <form onSubmit={handleSaveDeviceName} className="space-y-1.5 min-w-0">
            <label className="block text-xs font-medium text-stone-300 truncate">
              Terminal Label
            </label>
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="min-w-0 flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="shrink-0 px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-white text-xs font-semibold cursor-pointer transition"
              >
                Save
              </button>
            </div>
          </form>

          <div className="space-y-1.5 min-w-0">
            <label className="block text-xs font-medium text-stone-300 flex items-center gap-1.5 truncate">
              <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Store Currency Symbol</span>
            </label>
            <select
              value={currencySymbol}
              onChange={(e) => onChangeCurrencySymbol(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              <option value="₱">₱ — Philippine Peso (PHP)</option>
              <option value="$">$ — US Dollar (USD)</option>
              <option value="€">€ — Euro (EUR)</option>
              <option value="£">£ — British Pound (GBP)</option>
              <option value="¥">¥ — Japanese Yen (JPY)</option>
            </select>
          </div>

          <div className="space-y-1.5 min-w-0">
            <label className="block text-xs font-medium text-stone-300 flex items-center gap-1.5 truncate">
              <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Low-Stock Alert Threshold</span>
            </label>
            <input
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(e) => onChangeLowStockThreshold(parseInt(e.target.value, 10) || 0)}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* 1-Click Local Demo Snapshot Backup & Restore */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-400" />
            <span>Local Demo Snapshot Backup &amp; Restore</span>
          </h3>
          <p className="text-xs text-stone-400 mt-1">
            Export your entire branch database (including custom locally stored WebP product photos,
            stock adjustments, and POS receipts) to a portable JSON file, or restore a snapshot
            instantly on any device with zero cloud bucket usage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={snapshotBusy}
            onClick={handleExportSnapshot}
            data-testid="export-demo-snapshot-btn"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-bold inline-flex items-center gap-2 shadow-md shadow-amber-950/40 cursor-pointer transition"
          >
            <Download className="w-4 h-4" />
            <span>Export Demo Snapshot (.json)</span>
          </button>

          <label className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 hover:text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition">
            <Upload className="w-4 h-4 text-amber-400" />
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
            className="px-3.5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Reseed Missing Sample Hardware</span>
          </button>
        </div>
      </div>

      {/* Storage Persistence & Security Notes (Sections 9, 10, 13) */}
      <div className="glass-panel p-6 rounded-2xl space-y-3 text-xs">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          {isStoragePersisted ? (
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          )}
          <span>Browser Storage & Offline Security Model</span>
        </h3>

        <div className="space-y-2 text-slate-300 leading-relaxed">
          <p>
            <strong>Account:</strong> {user.email}
          </p>
          <p>
            <strong>Persistent Storage Status:</strong>{' '}
            {isStoragePersisted
              ? 'Granted (navigator.storage.persist() active — protected from automatic storage eviction).'
              : 'Best-effort storage (Browser did not grant explicit persistent lock; sync regularly on iOS/Safari).'}
          </p>
          <p className="flex items-start gap-2 text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              <strong>Security Tradeoff Note:</strong> Local POS receipts and hardware inventory
              records in IndexedDB are stored unencrypted so the register can query, ring up sales,
              and aggregate deltas instantaneously while offline. Avoid using shared public kiosks
              without clearing browser site data after syncing.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
