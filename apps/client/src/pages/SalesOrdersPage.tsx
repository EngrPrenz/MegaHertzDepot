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
    const countedCashNum = hasCountedInput
      ? Math.max(0, parseFloat(countedCash) || 0)
      : expectedDrawerCash;
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
      '     MEGAHERTZ DEPOT - OFFICIAL Z-READING REPORT',
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
      `  * Cash:              ${zReport.byMethod.Cash.count} txns - ${formatCurrency(zReport.byMethod.Cash.total, currencySymbol)}`,
      `  * GCash:             ${zReport.byMethod.GCash.count} txns - ${formatCurrency(zReport.byMethod.GCash.total, currencySymbol)}`,
      `  * Maya:              ${zReport.byMethod.Maya.count} txns - ${formatCurrency(zReport.byMethod.Maya.total, currencySymbol)}`,
      `  * Card:              ${zReport.byMethod.Card.count} txns - ${formatCurrency(zReport.byMethod.Card.total, currencySymbol)}`,
      `  * Split:             ${zReport.byMethod.Split.count} txns - ${formatCurrency(zReport.byMethod.Split.total, currencySymbol)}`,
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
    <div className="space-y-4">
      {/* Header Bar with Z-Reading CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
            <span>Sales Receipts, Warranty Lookup & RMA</span>
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Select a receipt to reprint, swap a defective serial number, or void a transaction.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsZReadingOpen(true)}
          data-testid="open-z-reading-btn"
          className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-xs inline-flex items-center gap-2 cursor-pointer transition-colors shrink-0"
        >
          <FileBarChart2 className="w-4 h-4" strokeWidth={1.75} />
          <span>Z-Reading / Shift Report</span>
        </button>
      </div>

      {/* Compact Summary Strip */}
      <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 dark:divide-zinc-800">
        <div className="p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Net POS Sales (Active)</div>
          <div className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
            {formatCurrency(totalRevenue, currencySymbol)}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Excludes {voidedOrdersCount} voided receipt(s)
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Completed Receipts</div>
          <div className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
            {activeOrders.length}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {pendingOrderIds.size} waiting to sync
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Hardware Units Sold</div>
          <div className="text-xl font-bold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
            {totalUnitsSold}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Backed by append-only stock adjustments
          </div>
        </div>
      </div>

      {/* Warranty & S/N Lookup Bar + Status Tabs */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Warranty / RMA lookup: search receipt # (MHD-...), S/N, customer, or part..."
            data-testid="sales-warranty-search"
            className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-3.5 pl-9 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
          />
        </div>

        <div className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 rounded-md p-1 shrink-0 overflow-x-auto">
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
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Semantic Responsive Table */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg p-10 text-center space-y-2">
          <Receipt className="w-8 h-8 text-zinc-400 mx-auto" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">No Matching Sales Receipts</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Complete a checkout on the POS Register to generate official receipts and warranty
            records.
          </p>
        </div>
      ) : (
        <div
          className="table-wrapper bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 rounded-lg"
          tabIndex={0}
          role="region"
          aria-label="Sales receipts ledger"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-100 dark:bg-carbon-elevated border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold">
                <th className="px-4 py-2.5">Receipt</th>
                <th className="px-4 py-2.5">Timestamp &amp; Customer</th>
                <th className="px-4 py-2.5">Items &amp; Serial Numbers</th>
                <th className="px-4 py-2.5">Tender</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredOrders.map((order) => {
                const isPending = pendingOrderIds.has(order.id);
                const isVoided = Boolean(order.notes?.includes('[VOIDED]'));
                const hasRma = Boolean(order.notes?.includes('[RMA REPLACED]'));
                const allSerials = order.items
                  .flatMap((i) => i.serialNumbers || [])
                  .filter(Boolean);
                const unitCount = order.items.reduce((s, i) => s + i.quantity, 0);

                return (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    data-testid={`order-row-${order.receiptNumber}`}
                    className={`cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                      isVoided ? 'opacity-65 bg-red-50/30 dark:bg-rose-950/20' : ''
                    }`}
                  >
                    <td data-label="Receipt" className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                      <span
                        className={
                          isVoided ? 'line-through text-red-700 dark:text-rose-400' : 'text-amber-800 dark:text-amber-400'
                        }
                      >
                        {order.receiptNumber}
                      </span>
                    </td>

                    <td data-label="Date / Customer" className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {order.customerName || 'Walk-in Customer'}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </td>

                    <td data-label="Items" className="px-4 py-3 max-w-xs">
                      <div className="text-zinc-800 dark:text-zinc-200 line-clamp-2">
                        {order.items.map((i) => `${i.quantity}x ${i.productName}`).join(' + ')}
                      </div>
                      {allSerials.length > 0 && (
                        <div className="text-[11px] text-amber-800 dark:text-amber-400 font-mono inline-flex items-center gap-1 mt-0.5">
                          <Barcode className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                          <span>S/N: {allSerials.join(', ')}</span>
                        </div>
                      )}
                    </td>

                    <td data-label="Tender" className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium">
                        {order.paymentMethod}
                      </span>
                    </td>

                    <td data-label="Status" className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isVoided && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-300 border border-red-200 dark:border-rose-800 font-semibold">
                            <Ban className="w-3 h-3" strokeWidth={1.75} />
                            Voided
                          </span>
                        )}
                        {hasRma && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold">
                            <Wrench className="w-3 h-3" strokeWidth={1.75} />
                            RMA Swapped
                          </span>
                        )}
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-carbon-elevated text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            <Clock className="w-3 h-3" strokeWidth={1.75} />
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                            Synced
                          </span>
                        )}
                      </div>
                    </td>

                    <td data-label="Total" className="px-4 py-3 text-right whitespace-nowrap">
                      <div
                        className={`font-bold tabular-nums text-sm ${
                          isVoided ? 'line-through text-red-700 dark:text-rose-400' : 'text-zinc-950 dark:text-zinc-50'
                        }`}
                      >
                        {formatCurrency(order.totalAmount, currencySymbol)}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {unitCount} {unitCount === 1 ? 'unit' : 'units'}
                      </div>
                    </td>

                    <td data-label="Action" className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrder(order);
                        }}
                        aria-label={`Inspect receipt ${order.receiptNumber}`}
                        className="p-1.5 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span className="hidden sm:inline font-medium">View</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
        subtitle={`${storeName} | POS Register Cash Drawer & Profit Reconciliation`}
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs">
          {/* Period Selector */}
          <div className="flex items-center justify-between bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 rounded-md p-2.5">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 pl-1">Report Timeframe</span>
            <div className="flex items-center gap-1 bg-zinc-200/70 dark:bg-zinc-900 p-0.5 rounded">
              <button
                type="button"
                onClick={() => setZPeriod('today')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  zPeriod === 'today'
                    ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Today&apos;s Shift
              </button>
              <button
                type="button"
                onClick={() => setZPeriod('all')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  zPeriod === 'all'
                    ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                All Recorded Sales
              </button>
            </div>
          </div>

          {/* Top Financial Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Net Sales</div>
              <div className="text-sm font-bold text-amber-800 dark:text-amber-400 tabular-nums mt-0.5">
                {formatCurrency(zReport.netRevenue, currencySymbol)}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{zReport.validCount} valid receipts</div>
            </div>

            <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Est. Gross Profit</div>
              <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                {formatCurrency(zReport.grossProfit, currencySymbol)}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{zReport.marginPercent}% margin</div>
            </div>

            <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">12% VAT Collected</div>
              <div className="text-sm font-bold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatCurrency(zReport.totalVat, currencySymbol)}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Net: {formatCurrency(zReport.vatableSales, currencySymbol)}
              </div>
            </div>

            <div className="p-3 rounded-md bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Voids &amp; RMAs</div>
              <div className="text-sm font-bold text-red-700 dark:text-rose-400 tabular-nums mt-0.5">
                {zReport.voidedCount} Void / {zReport.rmaCount} RMA
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {formatCurrency(zReport.voidedAmount, currencySymbol)} voided
              </div>
            </div>
          </div>

          {/* Tender Breakdown */}
          <div className="p-4 rounded-md bg-white dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <h4 className="font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-1.5 text-xs">
              <Banknote className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
              <span>Payment Tender Breakdown</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(['Cash', 'GCash', 'Maya', 'Card', 'Split'] as PaymentMethod[]).map((method) => (
                <div
                  key={method}
                  className="p-2.5 rounded bg-zinc-50 dark:bg-carbon border border-zinc-200 dark:border-zinc-800 space-y-0.5"
                >
                  <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{method}</div>
                  <div className="text-xs font-bold text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {formatCurrency(zReport.byMethod[method].total, currencySymbol)}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {zReport.byMethod[method].count} txn(s)
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cash Drawer Reconciliation Calculator */}
          <div className="p-4 rounded-md bg-white dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-zinc-950 dark:text-zinc-50 flex items-center gap-1.5 text-xs">
                <Calculator className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
                <span>Cash Drawer Reconciliation</span>
              </h4>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Physical Cash Count Verification</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="zreport-starting-float"
                  className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1"
                >
                  Starting Cash Float ({currencySymbol})
                </label>
                <input
                  id="zreport-starting-float"
                  type="number"
                  min={0}
                  value={startingFloat}
                  onChange={(e) => {
                    setStartingFloat(e.target.value);
                    localStorage.setItem(`megahertz_float_${storeId}`, e.target.value);
                  }}
                  className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950 dark:focus:border-amber-500"
                />
              </div>
              <div>
                <label
                  htmlFor="zreport-counted-cash"
                  className="block text-[11px] font-semibold text-amber-800 dark:text-amber-400 mb-1"
                >
                  Actual Physical Cash Counted ({currencySymbol})
                </label>
                <input
                  id="zreport-counted-cash"
                  type="number"
                  min={0}
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder={String(zReport.expectedDrawerCash)}
                  className="w-full bg-white dark:bg-carbon border border-amber-400 dark:border-amber-500 rounded px-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono tabular-nums focus:outline-none focus:border-zinc-950"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1 font-mono text-[11px] tabular-nums">
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Starting Cash Float</span>
                <span>{formatCurrency(zReport.floatNum, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>+ Cash Tender Sales</span>
                <span>{formatCurrency(zReport.byMethod.Cash.total, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-zinc-950 dark:text-zinc-50 font-bold pt-1 border-t border-zinc-200 dark:border-zinc-800">
                <span>Expected Cash in Drawer</span>
                <span className="text-amber-800 dark:text-amber-400">
                  {formatCurrency(zReport.expectedDrawerCash, currencySymbol)}
                </span>
              </div>
              {zReport.hasCountedInput && (
                <div className="flex justify-between items-center pt-1.5">
                  <span className="text-zinc-700 dark:text-zinc-300 font-sans font-medium">
                    Drawer Variance (Over / Short)
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded ${
                      Math.abs(zReport.cashVariance) < 0.01
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : zReport.cashVariance > 0
                        ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        : 'bg-red-50 dark:bg-rose-950/60 text-red-700 dark:text-rose-300 border border-red-200 dark:border-rose-800'
                    }`}
                  >
                    {Math.abs(zReport.cashVariance) < 0.01 ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
                        <span>BALANCED</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3" strokeWidth={1.75} />
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
              className="px-3.5 py-2 rounded-md bg-white dark:bg-carbon hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Download Report (.txt)</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Print Z-Reading</span>
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
