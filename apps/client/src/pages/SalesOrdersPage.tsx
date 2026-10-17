import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, SaleOrderLocal } from '../db/index.js';
import { ReceiptQuoteModal } from '../components/ReceiptQuoteModal.js';
import { formatCurrency } from '@countwise/shared';
import {
  Search,
  Receipt,
  ShieldCheck,
  Clock,
  Barcode,
  Printer,
  TrendingUp,
  ShoppingBag,
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
  const [selectedOrder, setSelectedOrder] = useState<SaleOrderLocal | null>(null);

  const orders = useLiveQuery(
    () => localDb.orders.where('storeId').equals(storeId).toArray(),
    [storeId],
    []
  );

  const outboxItems = useLiveQuery(
    () => localDb.outbox.where('storeId').equals(storeId).toArray(),
    [storeId],
    []
  );

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
    if (!q) return sortedOrders;
    return sortedOrders.filter((o) => {
      if (o.receiptNumber.toLowerCase().includes(q)) return true;
      if (o.customerName && o.customerName.toLowerCase().includes(q)) return true;
      if (o.paymentMethod.toLowerCase().includes(q)) return true;
      return o.items.some(
        (item) =>
          item.productName.toLowerCase().includes(q) ||
          (item.sku && item.sku.toLowerCase().includes(q)) ||
          (item.serialNumbers &&
            item.serialNumbers.some((sn) => sn.toLowerCase().includes(q)))
      );
    });
  }, [sortedOrders, search]);

  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, o) => sum + o.totalAmount, 0);
  }, [orders]);

  const totalUnitsSold = useMemo(() => {
    return orders.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
      0
    );
  }, [orders]);

  return (
    <div className="space-y-5">
      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Gross POS Sales</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">
            {formatCurrency(totalRevenue, currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Locked-in receipt totals (offline & synced)
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Completed Receipts</span>
            <Receipt className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{orders.length}</div>
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

      {/* Warranty & S/N Lookup Bar */}
      <div className="relative">
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

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center space-y-2">
          <Receipt className="w-8 h-8 text-slate-500 mx-auto" />
          <h3 className="text-sm font-semibold text-white">No Matching Sales Receipts</h3>
          <p className="text-xs text-slate-400">
            Complete a checkout on the POS Register tab to generate official receipts and warranty
            records.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isPending = pendingOrderIds.has(order.id);
            const allSerials = order.items.flatMap((i) => i.serialNumbers || []).filter(Boolean);

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                data-testid={`order-row-${order.receiptNumber}`}
                className="glass-panel-interactive rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm text-amber-400">
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
                    <div className="text-base font-extrabold text-white tabular-nums">
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

      <ReceiptQuoteModal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        storeName={storeName}
        currencySymbol={currencySymbol}
        order={selectedOrder}
      />
    </div>
  );
}

