import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, SaleOrderLocal } from '../db/index.js';
import { ReceiptQuoteModal } from '../components/ReceiptQuoteModal.js';
import { ModalDialog } from '../components/ModalDialog.js';
import { formatCurrency, PaymentMethod } from '@countwise/shared';
import {
  Search,
  Receipt,
  ShieldCheck,
  Clock,
  Barcode,
  Printer,
  TrendingUp,
  ShoppingBag,
  FileBarChart2,
  Download,
  Banknote,
  Calculator,
  Wrench,
  Ban,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface SalesOrdersPageProps {
  storeId: string;
  storeName: string;
  currencySymbol: string;
}

export function SalesOrdersPage({
  storeId,
  storeName,
  currencySymbol,
}: SalesOrdersPageProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'voided' | 'rma'>('all');
  const [selectedOrder, setSelectedOrder] = useState<SaleOrderLocal | null>(null);

  // Z-Reading / Shift Report Modal State
  const [isZReadingOpen, setIsZReadingOpen] = useState(false);
  const [zPeriod, setZPeriod] = useState<'today' | 'all'>('today');
  const [startingFloat, setStartingFloat] = useState<string>(() => {
    return localStorage.getItem(`megahertz_float_${storeId}`) || '5000';
  });
  const [countedCash, setCountedCash] = useState<string>('');

  const orders = useLiveQuery(
    () => localDb.orders.where('storeId').equals(storeId).toArray(),
    [storeId],
    []
  );

  const products = useLiveQuery(
    () => localDb.products.where('storeId').equals(storeId).toArray(),
    [storeId],
    []
  );

  const outboxItems = useLiveQuery(
    () => localDb.outbox.where('storeId').equals(storeId).toArray(),
    [storeId],
    []
  );

  const costPriceByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (typeof p.costPrice === 'number' && p.costPrice > 0) {
        map.set(p.id, p.costPrice);
      } else {
        // Fallback estimate (80% of retail price if costPrice not set)
        map.set(p.id, Math.round((p.price || 0) * 0.8));
      }
    }
    return map;
  }, [products]);

  const pendingOrderIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of outboxItems) {
      if (m.type === 'order.create' && m.entityId) {
        set.add(m.entityId);
      }
    }
    return set;
  }, [outboxItems]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => b.createdAt - a.createdAt);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedOrders.filter((o) => {
      const isVoided = Boolean(o.notes?.includes('[VOIDED]'));
      const hasRma = Boolean(o.notes?.includes('[RMA REPLACED]'));

      if (statusFilter === 'active' && isVoided) return false;
      if (statusFilter === 'voided' && !isVoided) return false;
      if (statusFilter === 'rma' && !hasRma) return false;

      if (!q) return true;
      if (o.receiptNumber.toLowerCase().includes(q)) return true;
      if (o.customerName && o.customerName.toLowerCase().includes(q)) return true;
      if (o.paymentMethod.toLowerCase().includes(q)) return true;
      if (o.notes && o.notes.toLowerCase().includes(q)) return true;
      return o.items.some(
        (item) =>
          item.productName.toLowerCase().includes(q) ||
          (item.sku && item.sku.toLowerCase().includes(q)) ||
          (item.serialNumbers &&
            item.serialNumbers.some((sn) => sn.toLowerCase().includes(q)))
      );
    });
  }, [sortedOrders, search, statusFilter]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => !o.notes?.includes('[VOIDED]'));
  }, [orders]);

  const voidedOrdersCount = orders.length - activeOrders.length;

  const totalRevenue = useMemo(() => {
    return activeOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  }, [activeOrders]);

  const totalUnitsSold = useMemo(() => {
    return activeOrders.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
      0
    );
  }, [activeOrders]);

  // Z-Reading Report Calculations
  const zReport = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const scopedOrders =
      zPeriod === 'today'
        ? orders.filter((o) => o.createdAt >= startOfTodayMs)
        : orders;

    const validOrders = scopedOrders.filter((o) => !o.notes?.includes('[VOIDED]'));
    const voidedOrders = scopedOrders.filter((o) => o.notes?.includes('[VOIDED]'));
    const rmaOrders = scopedOrders.filter((o) => o.notes?.includes('[RMA REPLACED]'));

    const grossSubtotal = validOrders.reduce((s, o) => s + o.subtotal, 0);
    const totalDiscounts = validOrders.reduce((s, o) => s + (o.discountAmount || 0), 0);
    const netRevenue = validOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalVat = validOrders.reduce((s, o) => s + (o.taxAmount || 0), 0);
    const vatableSales = Math.max(0, netRevenue - totalVat);
    const voidedAmount = voidedOrders.reduce((s, o) => s + o.totalAmount, 0);

    let estimatedCogs = 0;
    for (const o of validOrders) {
      for (const item of o.items) {
        const unitCost =
          costPriceByProductId.get(item.productId) ?? Math.round(item.unitPrice * 0.8);
        estimatedCogs += unitCost * item.quantity;
      }
    }
    const grossProfit = netRevenue - estimatedCogs;
    const marginPercent = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 100) : 0;

    const byMethod: Record<PaymentMethod, { count: number; total: number }> = {
      Cash: { count: 0, total: 0 },
      GCash: { count: 0, total: 0 },
      Maya: { count: 0, total: 0 },
      Card: { count: 0, total: 0 },
      Split: { count: 0, total: 0 },
    };

    for (const o of validOrders) {
      const m = o.paymentMethod || 'Cash';
      if (!byMethod[m]) {
        byMethod[m] = { count: 0, total: 0 };
      }
      byMethod[m].count += 1;
      byMethod[m].total += o.totalAmount;
    }

    const floatNum = Math.max(0, parseFloat(startingFloat) || 0);
    const expectedDrawerCash = floatNum + byMethod.Cash.total;
    const hasCountedInput = countedCash.trim() !== '';
    const countedCashNum = hasCountedInput ? Math.max(0, parseFloat(countedCash) || 0) : expectedDrawerCash;
    const cashVariance = countedCashNum - expectedDrawerCash;

    return {
      totalReceipts: scopedOrders.length,
      validCount: validOrders.length,
      voidedCount: voidedOrders.length,
      voidedAmount,
      rmaCount: rmaOrders.length,
      grossSubtotal,
      totalDiscounts,
      netRevenue,
      vatableSales,
      totalVat,
      estimatedCogs,
      grossProfit,
      marginPercent,
      byMethod,
      floatNum,
      expectedDrawerCash,
      hasCountedInput,
      countedCashNum,
      cashVariance,
    };
  }, [orders, zPeriod, costPriceByProductId, startingFloat, countedCash]);

  const handleDownloadZReport = () => {
    const lines = [
      '====================================================',
      `     MEGAHERTZ DEPOT — OFFICIAL Z-READING REPORT`,
      `     Branch: ${storeName}`,
      `     Scope:  ${zPeriod === 'today' ? "Today's Shift" : 'All-Time Cumulative'}`,
      `     Generated: ${new Date().toLocaleString()}`,
      '====================================================',
      `VALID RECEIPTS:        ${zReport.validCount}`,
      `VOIDED RECEIPTS:       ${zReport.voidedCount} (${formatCurrency(zReport.voidedAmount, currencySymbol)})`,
      `RMA SWAPS LOGGED:      ${zReport.rmaCount}`,
      '----------------------------------------------------',
      `GROSS SUBTOTAL:        ${formatCurrency(zReport.grossSubtotal, currencySymbol)}`,
      `DISCOUNTS GIVEN:      -${formatCurrency(zReport.totalDiscounts, currencySymbol)}`,
      `NET SALES REVENUE:     ${formatCurrency(zReport.netRevenue, currencySymbol)}`,
      `VATABLE SALES (NET):   ${formatCurrency(zReport.vatableSales, currencySymbol)}`,
      `12% VAT COLLECTED:     ${formatCurrency(zReport.totalVat, currencySymbol)}`,
      `EST. COGS:             ${formatCurrency(zReport.estimatedCogs, currencySymbol)}`,
      `EST. GROSS PROFIT:     ${formatCurrency(zReport.grossProfit, currencySymbol)} (${zReport.marginPercent}%)`,
      '----------------------------------------------------',
      'TENDER BREAKDOWN:',
      `  • Cash:              ${zReport.byMethod.Cash.count} txns — ${formatCurrency(zReport.byMethod.Cash.total, currencySymbol)}`,
      `  • GCash:             ${zReport.byMethod.GCash.count} txns — ${formatCurrency(zReport.byMethod.GCash.total, currencySymbol)}`,
      `  • Maya:              ${zReport.byMethod.Maya.count} txns — ${formatCurrency(zReport.byMethod.Maya.total, currencySymbol)}`,
      `  • Card:              ${zReport.byMethod.Card.count} txns — ${formatCurrency(zReport.byMethod.Card.total, currencySymbol)}`,
      `  • Split:             ${zReport.byMethod.Split.count} txns — ${formatCurrency(zReport.byMethod.Split.total, currencySymbol)}`,
      '----------------------------------------------------',
      'CASH DRAWER RECONCILIATION:',
      `  Starting Cash Float: ${formatCurrency(zReport.floatNum, currencySymbol)}`,
      `  + Cash Sales:        ${formatCurrency(zReport.byMethod.Cash.total, currencySymbol)}`,
      `  = Expected In Drawer:${formatCurrency(zReport.expectedDrawerCash, currencySymbol)}`,
      `  Actual Counted Cash: ${formatCurrency(zReport.countedCashNum, currencySymbol)}`,
      `  Drawer Variance:     ${zReport.cashVariance >= 0 ? '+' : ''}${formatCurrency(zReport.cashVariance, currencySymbol)}`,
      '====================================================',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Z-Reading-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header Bar with Z-Reading Report CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-900/70 border border-stone-800 rounded-2xl p-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-400" />
            <span>Sales Receipts, Warranty S/N Lookup &amp; RMA</span>
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Click any receipt to reprint, process an RMA defective serial replacement, or void/refund.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsZReadingOpen(true)}
          data-testid="open-z-reading-btn"
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs inline-flex items-center gap-2 shadow-md shadow-amber-950/40 cursor-pointer transition shrink-0"
        >
          <FileBarChart2 className="w-4 h-4" />
          <span>Z-Reading / Shift Report</span>
        </button>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Net POS Sales (Active)</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {formatCurrency(totalRevenue, currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Excludes {voidedOrdersCount} voided receipt(s)
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Completed Receipts</span>
            <Receipt className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{activeOrders.length}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {pendingOrderIds.size} waiting in offline outbox
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Hardware Units Sold</span>
            <ShoppingBag className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{totalUnitsSold}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Backed by append-only stock adjustments
          </p>
        </div>
      </div>

      {/* Warranty & S/N Lookup Bar + Quick Status Filter Pills */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Warranty / RMA Lookup: Search by Receipt # (MHD-...), Serial Number (S/N), Customer, or Hardware Name..."
            data-testid="sales-warranty-search"
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1 shrink-0">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'rma', label: 'RMA Swapped' },
              { id: 'voided', label: 'Voided' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center space-y-2">
          <Receipt className="w-8 h-8 text-slate-500 mx-auto" />
          <h3 className="text-sm font-semibold text-white">No Matching Sales Receipts</h3>
          <p className="text-xs text-slate-400">
            Complete a checkout on the POS Register to generate official receipts and warranty
            records.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isPending = pendingOrderIds.has(order.id);
            const isVoided = Boolean(order.notes?.includes('[VOIDED]'));
            const hasRma = Boolean(order.notes?.includes('[RMA REPLACED]'));
            const allSerials = order.items.flatMap((i) => i.serialNumbers || []).filter(Boolean);

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                data-testid={`order-row-${order.receiptNumber}`}
                className={`glass-panel-interactive rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer ${
                  isVoided ? 'opacity-65 border-rose-900/40' : ''
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-mono font-bold text-sm ${
                        isVoided ? 'line-through text-rose-400' : 'text-amber-400'
                      }`}
                    >
                      {order.receiptNumber}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-medium">
                      {order.paymentMethod}
                    </span>
                    {order.customerName && (
                      <span className="text-xs text-slate-300 font-semibold">
                        • {order.customerName}
                      </span>
                    )}
                    {isVoided && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/70 font-bold">
                        <Ban className="w-2.5 h-2.5" />
                        VOIDED
                      </span>
                    )}
                    {hasRma && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/70 font-bold">
                        <Wrench className="w-2.5 h-2.5" />
                        RMA SWAPPED
                      </span>
                    )}
                    {isPending ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-950/70 text-blue-300 border border-blue-800/70">
                        <Clock className="w-2.5 h-2.5" />
                        Pending sync
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        Synced
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-300">
                    {order.items.map((i) => `${i.quantity}x ${i.productName}`).join(' + ')}
                  </div>

                  <div className="flex items-center flex-wrap gap-3 text-[11px] text-slate-500">
                    <span>{new Date(order.createdAt).toLocaleString()}</span>
                    <span>• Terminal: {order.deviceId.slice(0, 12)}</span>
                    {allSerials.length > 0 && (
                      <span className="text-amber-300 font-mono inline-flex items-center gap-1">
                        <Barcode className="w-3 h-3" />
                        S/N: {allSerials.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right">
                    <div
                      className={`text-base font-extrabold tabular-nums ${
                        isVoided ? 'line-through text-rose-400' : 'text-white'
                      }`}
                    >
                      {formatCurrency(order.totalAmount, currencySymbol)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} unit(s)
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
                    <Printer className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt & RMA / Void Modal */}
      <ReceiptQuoteModal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        storeName={storeName}
        currencySymbol={currencySymbol}
        order={selectedOrder}
        onOrderUpdated={(updated) => setSelectedOrder(updated)}
      />

      {/* End-of-Day Z-Reading & Cash Drawer Reconciliation Modal */}
      <ModalDialog
        open={isZReadingOpen}
        onClose={() => setIsZReadingOpen(false)}
        title="End-of-Day Z-Reading & Shift Report"
        subtitle={`${storeName} • POS Register Cash Drawer & Profit Reconciliation`}
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs">
          {/* Period Selector */}
          <div className="flex items-center justify-between bg-stone-950 border border-stone-800 rounded-xl p-2.5">
            <span className="font-semibold text-stone-300 pl-1">Report Timeframe:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setZPeriod('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  zPeriod === 'today'
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-900 text-stone-400 hover:text-white'
                }`}
              >
                Today&apos;s Shift
              </button>
              <button
                type="button"
                onClick={() => setZPeriod('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  zPeriod === 'all'
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-900 text-stone-400 hover:text-white'
                }`}
              >
                All Recorded Sales
              </button>
            </div>
          </div>

          {/* Top Financial Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-stone-950 border border-stone-800">
              <div className="text-[10px] text-stone-400 uppercase">Net Sales</div>
              <div className="text-sm font-extrabold text-amber-400 font-mono mt-0.5">
                {formatCurrency(zReport.netRevenue, currencySymbol)}
              </div>
              <div className="text-[10px] text-stone-500">{zReport.validCount} valid receipts</div>
            </div>

            <div className="p-3 rounded-xl bg-stone-950 border border-stone-800">
              <div className="text-[10px] text-stone-400 uppercase">Est. Gross Profit</div>
              <div className="text-sm font-extrabold text-emerald-400 font-mono mt-0.5">
                {formatCurrency(zReport.grossProfit, currencySymbol)}
              </div>
              <div className="text-[10px] text-stone-500">{zReport.marginPercent}% margin</div>
            </div>

            <div className="p-3 rounded-xl bg-stone-950 border border-stone-800">
              <div className="text-[10px] text-stone-400 uppercase">12% VAT Collected</div>
              <div className="text-sm font-extrabold text-white font-mono mt-0.5">
                {formatCurrency(zReport.totalVat, currencySymbol)}
              </div>
              <div className="text-[10px] text-stone-500">
                Net: {formatCurrency(zReport.vatableSales, currencySymbol)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-stone-950 border border-stone-800">
              <div className="text-[10px] text-stone-400 uppercase">Voids &amp; RMAs</div>
              <div className="text-sm font-extrabold text-rose-400 font-mono mt-0.5">
                {zReport.voidedCount} Void / {zReport.rmaCount} RMA
              </div>
              <div className="text-[10px] text-stone-500">
                {formatCurrency(zReport.voidedAmount, currencySymbol)} voided
              </div>
            </div>
          </div>

          {/* Tender Breakdown Table */}
          <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2.5">
            <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
              <Banknote className="w-4 h-4 text-amber-400" />
              <span>Payment Tender Breakdown</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(['Cash', 'GCash', 'Maya', 'Card', 'Split'] as PaymentMethod[]).map((method) => (
                <div
                  key={method}
                  className="p-2.5 rounded-lg bg-stone-900 border border-stone-800/80 space-y-0.5"
                >
                  <div className="text-[11px] font-bold text-stone-300">{method}</div>
                  <div className="text-xs font-extrabold text-amber-400 font-mono">
                    {formatCurrency(zReport.byMethod[method].total, currencySymbol)}
                  </div>
                  <div className="text-[10px] text-stone-500">
                    {zReport.byMethod[method].count} txn(s)
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cash Drawer Reconciliation Calculator */}
          <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Calculator className="w-4 h-4 text-amber-400" />
                <span>Cash Drawer Reconciliation</span>
              </h4>
              <span className="text-[10px] text-stone-400">Physical Cash Count Verification</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-stone-400 mb-1">
                  Starting Cash Float ({currencySymbol})
                </label>
                <input
                  type="number"
                  min={0}
                  value={startingFloat}
                  onChange={(e) => {
                    setStartingFloat(e.target.value);
                    localStorage.setItem(`megahertz_float_${storeId}`, e.target.value);
                  }}
                  className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-amber-300 font-semibold mb-1">
                  Actual Physical Cash Counted ({currencySymbol})
                </label>
                <input
                  type="number"
                  min={0}
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder={String(zReport.expectedDrawerCash)}
                  className="w-full bg-stone-900 border border-amber-500/40 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-stone-800 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between text-stone-400">
                <span>Starting Cash Float:</span>
                <span>{formatCurrency(zReport.floatNum, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>+ Cash Tender Sales:</span>
                <span>{formatCurrency(zReport.byMethod.Cash.total, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-white font-bold pt-1 border-t border-stone-900">
                <span>Expected Cash in Drawer:</span>
                <span className="text-amber-400">
                  {formatCurrency(zReport.expectedDrawerCash, currencySymbol)}
                </span>
              </div>
              {zReport.hasCountedInput && (
                <div className="flex justify-between items-center pt-1.5">
                  <span className="text-stone-300">Drawer Variance (Over / Short):</span>
                  <span
                    className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded ${
                      Math.abs(zReport.cashVariance) < 0.01
                        ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/60'
                        : zReport.cashVariance > 0
                        ? 'bg-amber-950/70 text-amber-300 border border-amber-700/60'
                        : 'bg-rose-950/70 text-rose-300 border border-rose-700/60'
                    }`}
                  >
                    {Math.abs(zReport.cashVariance) < 0.01 ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>BALANCED</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3" />
                        <span>
                          {zReport.cashVariance > 0 ? 'OVER +' : 'SHORT '}
                          {formatCurrency(zReport.cashVariance, currencySymbol)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleDownloadZReport}
              className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Report (.txt)</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold inline-flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-amber-950/40"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Z-Reading</span>
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
