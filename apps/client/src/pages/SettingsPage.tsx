import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    localRepository.getDeviceId().then(setDeviceId);
    localRepository.getDeviceName().then(setDeviceName);
  }, []);

  const handleSaveDeviceName = async (e: React.FormEvent) => {
    e.preventDefault();
    await localRepository.setDeviceName(deviceName);
    setStatusMsg('Terminal label saved locally.');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleCreateNewStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    await onCreateStore(newStoreName.trim());
    setNewStoreName('');
    setStatusMsg('New store branch created and activated.');
    setTimeout(() => setStatusMsg(null), 3000);
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
      setStatusMsg(`Added ${data.member.email} to store!`);
    } catch (err: any) {
      setStatusMsg(err.message || 'Could not invite member while offline');
    }
    setTimeout(() => setStatusMsg(null), 4000);
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Selected Store Branch
            </label>
            <select
              value={currentStoreId}
              onChange={(e) => onSelectStore(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2.5 text-sm text-white"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleCreateNewStore}>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Create Additional Store Branch
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="e.g. Gilmore Flagship / Mall Kiosk"
                className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shadow-md shadow-amber-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>Create</span>
              </button>
            </div>
          </form>
        </div>

        {/* Invite Staff Member to Store */}
        <form onSubmit={handleInviteStaff} className="pt-2 border-t border-stone-800">
          <label className="block text-xs font-medium text-stone-300 mb-1.5 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>Add Cashier / Technician to Active Branch (by registered email)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="cashier2@megahertzdepot.com"
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
            >
              Add Member
            </button>
          </div>
        </form>
      </div>

      {/* Device Identity, Currency & Low-Stock Threshold */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-blue-400" />
          <span>POS Terminal Node & Store Preferences</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <form onSubmit={handleSaveDeviceName} className="space-y-2">
            <label className="block text-xs font-medium text-stone-300">
              Terminal Label (HLC Node: <code className="text-amber-400">{deviceId}</code>)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-xs font-semibold cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-stone-300 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Store Currency Symbol</span>
            </label>
            <select
              value={currencySymbol}
              onChange={(e) => onChangeCurrencySymbol(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-white"
            >
              <option value="₱">₱ — Philippine Peso (PHP)</option>
              <option value="$">$ — US Dollar (USD)</option>
              <option value="€">€ — Euro (EUR)</option>
              <option value="£">£ — British Pound (GBP)</option>
              <option value="¥">¥ — Japanese Yen (JPY)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-stone-300 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>Low-Stock Alert Threshold</span>
            </label>
            <input
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(e) => onChangeLowStockThreshold(parseInt(e.target.value, 10) || 0)}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-white"
            />
          </div>
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
