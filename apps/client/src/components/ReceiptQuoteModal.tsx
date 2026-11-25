import { useState } from 'react';
import { ModalDialog } from './ModalDialog.js';
import { SaleOrderLocal, ProductLocal } from '../db/index.js';
import { localRepository } from '../services/localRepository.js';
import {
  formatCurrency,
  HardwareCategory,
  PcBuildCompatibilityReport,
} from '@countwise/shared';
import {
  Printer,
  Download,
  CheckCircle2,
  ShieldCheck,
  Cpu,
  AlertTriangle,
  RotateCcw,
  Wrench,
  Ban,
  Copy,
  Check,
  Calendar,
} from 'lucide-react';

export interface QuoteBuildData {
  customerName: string;
  notes?: string;
  parts: Array<{ slot: HardwareCategory; product: ProductLocal }>;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  compatibility: PcBuildCompatibilityReport;
  createdAt: number;
  quoteNumber: string;
}

interface ReceiptQuoteModalProps {
  open: boolean;
  onClose: () => void;
  storeName: string;
  currencySymbol: string;
  order?: SaleOrderLocal | null;
  quote?: QuoteBuildData | null;
  userId?: string;
  onOrderUpdated?: (updatedOrder: SaleOrderLocal) => void;
}

export function ReceiptQuoteModal({
  open,
  onClose,
  storeName,
  currencySymbol,
  order,
  quote,
  userId = 'staff-admin',
  onOrderUpdated,
}: ReceiptQuoteModalProps) {
  const [activeAction, setActiveAction] = useState<'none' | 'void' | 'rma'>('none');
  const [voidReason, setVoidReason] = useState('');
  const [restockDamaged, setRestockDamaged] = useState(false);

  const [rmaProductId, setRmaProductId] = useState('');
  const [defectiveSerial, setDefectiveSerial] = useState('');
  const [replacementSerial, setReplacementSerial] = useState('');
  const [rmaIssue, setRmaIssue] = useState('');

  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  if (!order && !quote) return null;

  const isReceipt = Boolean(order);
  const isVoided = Boolean(order?.notes?.includes('[VOIDED]'));
  const hasRma = Boolean(order?.notes?.includes('[RMA REPLACED]'));

  const title = isReceipt
    ? `Official Receipt · ${order!.receiptNumber}`
    : `PC Build Quotation · ${quote!.quoteNumber}`;

  const validityDate = quote
    ? new Date(quote.createdAt + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
    : '';

  const buildPlainTextDocument = (): string => {
    const lines: string[] = [];
    lines.push('====================================================');
    lines.push(`        MEGAHERTZ DEPOT - ${storeName.toUpperCase()}`);
    lines.push('   Computer Hardware, Custom Rigs & Peripherals');
    lines.push('====================================================');

    if (order) {
      lines.push(`OFFICIAL RECEIPT #: ${order.receiptNumber}`);
      if (isVoided) lines.push('STATUS: *** VOIDED / REFUNDED ***');
      lines.push(`DATE: ${new Date(order.createdAt).toLocaleString()}`);
      lines.push(`TERMINAL: ${order.deviceId}`);
      if (order.customerName) lines.push(`CUSTOMER: ${order.customerName}`);
      if (order.customerPhone) lines.push(`CONTACT: ${order.customerPhone}`);
      lines.push('----------------------------------------------------');
      for (const item of order.items) {
        lines.push(
          `${item.quantity}x ${item.productName} @ ${formatCurrency(
            item.unitPrice,
            currencySymbol
          )} = ${formatCurrency(item.quantity * item.unitPrice, currencySymbol)}`
        );
        if (item.sku) lines.push(`   SKU: ${item.sku}`);
        if (item.warranty) lines.push(`   WARRANTY: ${item.warranty}`);
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          lines.push(`   S/N: ${item.serialNumbers.join(', ')}`);
        }
      }
      lines.push('----------------------------------------------------');
      lines.push(`SUBTOTAL:       ${formatCurrency(order.subtotal, currencySymbol)}`);
      if (order.discountAmount > 0) {
        lines.push(`DISCOUNT:      -${formatCurrency(order.discountAmount, currencySymbol)}`);
      }
      lines.push(
        `VAT (${order.taxRate}% ${order.taxInclusive ? 'Incl.' : 'Excl.'}): ${formatCurrency(
          order.taxAmount,
          currencySymbol
        )}`
      );
      lines.push(`TOTAL PAID:     ${formatCurrency(order.totalAmount, currencySymbol)}`);
      lines.push(`PAYMENT METHOD: ${order.paymentMethod}`);
      lines.push(`TENDERED:       ${formatCurrency(order.amountTendered, currencySymbol)}`);
      lines.push(`CHANGE DUE:     ${formatCurrency(order.changeDue, currencySymbol)}`);
      if (order.notes) {
        lines.push('----------------------------------------------------');
        lines.push(`NOTES / LOG:    ${order.notes}`);
      }
      lines.push('====================================================');
      lines.push('WARRANTY TERMS: Present this receipt & matching S/N');
      lines.push('for all hardware RMA and supplier warranty claims.');
    } else if (quote) {
      lines.push(`PC BUILD QUOTATION #: ${quote.quoteNumber}`);
      lines.push(`DATE ISSUED: ${new Date(quote.createdAt).toLocaleString()}`);
      lines.push(`PRICE VALID UNTIL: ${validityDate} (7-Day Guarantee)`);
      if (quote.customerName) lines.push(`PREPARED FOR: ${quote.customerName}`);
      lines.push(
        `COMPATIBILITY: ${
          quote.compatibility.isCompatible ? 'VERIFIED COMPATIBLE' : 'HAS WARNINGS'
        } (${quote.compatibility.estimatedSystemWatts}W Est. Load | Rec. PSU: ${
          quote.compatibility.recommendedPsuWatts
        }W+)`
      );
      lines.push('----------------------------------------------------');
      for (const entry of quote.parts) {
        lines.push(
          `[${entry.slot}] ${entry.product.name}${
            entry.product.sku ? ` (${entry.product.sku})` : ''
          } - ${formatCurrency(entry.product.price || 0, currencySymbol)}`
        );
        if (entry.product.warranty) {
          lines.push(`   Warranty: ${entry.product.warranty}`);
        }
      }
      lines.push('----------------------------------------------------');
      lines.push(`SUBTOTAL:        ${formatCurrency(quote.subtotal, currencySymbol)}`);
      if (quote.discountAmount > 0) {
        lines.push(`BUNDLE DISCOUNT: -${formatCurrency(quote.discountAmount, currencySymbol)}`);
      }
      lines.push(`QUOTED TOTAL:    ${formatCurrency(quote.totalAmount, currencySymbol)}`);
      lines.push('====================================================');
      lines.push('Present this Quote # at the MegaHertz Depot counter');
      lines.push('to lock in your custom PC build & free assembly.');
    }

    return lines.join('\n');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainTextDocument());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadText = () => {
    const text = buildPlainTextDocument();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isReceipt
      ? `${order!.receiptNumber}-receipt.txt`
      : `${quote!.quoteNumber}-pc-quote.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmVoid = async () => {
    if (!order) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const updated = await localRepository.voidSaleOrder({
        orderId: order.id,
        storeId: order.storeId,
        userId,
        reason: voidReason || 'Customer Return / Refund',
        restockAsDamaged: restockDamaged,
      });
      setActionMsg({
        type: 'success',
        text: restockDamaged
          ? 'Receipt voided (items marked as damaged, not restocked to sellable inventory).'
          : 'Receipt voided and all hardware units restocked into sellable inventory.',
      });
      setActiveAction('none');
      setVoidReason('');
      onOrderUpdated?.(updated);
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text: err?.message || 'Failed to void receipt.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRma = async () => {
    if (!order) return;
    const targetProductId = rmaProductId || order.items[0]?.productId;
    if (!targetProductId) return;

    if (!replacementSerial.trim()) {
      setActionMsg({
        type: 'error',
        text: 'Please enter the replacement unit Serial Number (S/N).',
      });
      return;
    }

    setBusy(true);
    setActionMsg(null);
    try {
      const updated = await localRepository.processRmaReplacement({
        orderId: order.id,
        storeId: order.storeId,
        userId,
        productId: targetProductId,
        defectiveSerial: defectiveSerial.trim() || 'UNSPECIFIED-SN',
        replacementSerial: replacementSerial.trim(),
        issueDescription: rmaIssue.trim() || 'Defective hardware under warranty',
      });
      setActionMsg({
        type: 'success',
        text: 'RMA replacement recorded! 1 replacement unit deducted from inventory and S/N updated.',
      });
      setActiveAction('none');
      setDefectiveSerial('');
      setReplacementSerial('');
      setRmaIssue('');
      onOrderUpdated?.(updated);
    } catch (err: any) {
      setActionMsg({
        type: 'error',
        text: err?.message || 'Failed to process RMA replacement.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={() => {
        setActiveAction('none');
        setActionMsg(null);
        onClose();
      }}
      title={title}
      subtitle="MegaHertz Depot Official Hardware Documentation"
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs">
        {actionMsg && (
          <div
            className={`p-3 rounded-md border flex items-center gap-2 text-xs font-medium ${
              actionMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {actionMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" strokeWidth={1.75} />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0" strokeWidth={1.75} />
            )}
            <span>{actionMsg.text}</span>
          </div>
        )}

        {/* Printable Receipt / Quote Paper Container */}
        <div
          data-testid="receipt-document"
          className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-100 text-zinc-950 border border-zinc-200 dark:border-zinc-300 space-y-3 font-mono"
        >
          <div className="text-center border-b border-zinc-200 pb-3">
            <div className="inline-flex items-center gap-1.5 text-zinc-950 font-semibold text-sm">
              <Cpu className="w-4 h-4 text-amber-700" strokeWidth={1.75} />
              <span>MEGAHERTZ DEPOT</span>
            </div>
            <p className="text-[11px] text-zinc-600">{storeName} · PC Hardware &amp; Peripherals</p>
            <p className="text-[11px] text-zinc-600 mt-0.5 tabular-nums">
              {isReceipt
                ? `Receipt: ${order!.receiptNumber} · ${new Date(
                    order!.createdAt
                  ).toLocaleString()}`
                : `Quote: ${quote!.quoteNumber} · ${new Date(quote!.createdAt).toLocaleString()}`}
            </p>

            {isReceipt && (isVoided || hasRma) && (
              <div className="flex items-center justify-center gap-2 mt-2">
                {isVoided && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200 uppercase">
                    VOIDED / REFUNDED
                  </span>
                )}
                {hasRma && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 uppercase">
                    RMA WARRANTY SWAPPED
                  </span>
                )}
              </div>
            )}
          </div>

          {order && (
            <>
              {(order.customerName || order.customerPhone) && (
                <div className="text-[11px] text-zinc-700 border-b border-zinc-200 pb-2">
                  {order.customerName && <div>Customer: {order.customerName}</div>}
                  {order.customerPhone && <div>Contact: {order.customerPhone}</div>}
                </div>
              )}

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {order.items.map((item, idx) => (
                  <div key={`${item.productId}-${idx}`} className="space-y-0.5">
                    <div className="flex justify-between gap-2 text-zinc-950 font-semibold">
                      <span className={isVoided ? 'line-through text-zinc-500' : ''}>
                        {item.quantity}x {item.productName}
                      </span>
                      <span className={`tabular-nums shrink-0 ${isVoided ? 'line-through text-zinc-500' : 'text-zinc-950'}`}>
                        {formatCurrency(item.quantity * item.unitPrice, currencySymbol)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                      {item.sku && <span>SKU: {item.sku}</span>}
                      {item.warranty && (
                        <span className="text-amber-800">· {item.warranty}</span>
                      )}
                    </div>
                    {item.serialNumbers && item.serialNumbers.filter(Boolean).length > 0 && (
                      <div className="text-[10px] text-zinc-800 bg-white px-2 py-0.5 rounded border border-zinc-200">
                        S/N: {item.serialNumbers.filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-zinc-200 pt-2.5 space-y-1 text-[11px] tabular-nums">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(order.subtotal, currencySymbol)}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>Discount</span>
                    <span>-{formatCurrency(order.discountAmount, currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between text-zinc-600">
                  <span>
                    VAT ({order.taxRate}% {order.taxInclusive ? 'Included' : 'Added'})
                  </span>
                  <span>{formatCurrency(order.taxAmount, currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-zinc-950 pt-1.5 border-t border-zinc-200">
                  <span>TOTAL ({order.paymentMethod})</span>
                  <span className={isVoided ? 'line-through text-rose-700' : 'text-zinc-950'}>
                    {formatCurrency(order.totalAmount, currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600 text-[10px]">
                  <span>Tendered: {formatCurrency(order.amountTendered, currencySymbol)}</span>
                  <span>Change: {formatCurrency(order.changeDue, currencySymbol)}</span>
                </div>
              </div>

              {order.notes && (
                <div className="p-2.5 rounded bg-white border border-zinc-200 text-[10px] text-zinc-700 space-y-0.5">
                  <div className="font-semibold text-zinc-900">Order &amp; Audit Log:</div>
                  <div className="leading-relaxed break-words">{order.notes}</div>
                </div>
              )}

              <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-amber-700" strokeWidth={1.75} />
                <span>
                  Official Warranty Slip: Keep receipt {order.receiptNumber} and recorded Serial
                  Numbers for RMA service.
                </span>
              </div>
            </>
          )}

          {quote && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pb-2 border-b border-zinc-200">
                <div>
                  <div className="text-zinc-800">
                    Prepared For: <strong>{quote.customerName || 'Walk-in PC Builder'}</strong>
                  </div>
                  <div className="text-[10px] text-zinc-600 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 text-amber-700" strokeWidth={1.75} />
                    <span>Price Guarantee Valid Until: {validityDate}</span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
                    quote.compatibility.isCompatible
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {quote.compatibility.isCompatible ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-700" strokeWidth={1.75} />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-rose-700" strokeWidth={1.75} />
                  )}
                  <span className="tabular-nums">
                    {quote.compatibility.estimatedSystemWatts}W Load · Rec. PSU:{' '}
                    {quote.compatibility.recommendedPsuWatts}W+
                  </span>
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {quote.parts.map(({ slot, product }, idx) => (
                  <div
                    key={`${slot}-${product.id}-${idx}`}
                    className="flex justify-between gap-2 text-[11px] border-b border-zinc-200 pb-1.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <span className="text-amber-800 font-semibold">[{slot}]</span>{' '}
                      <span className="text-zinc-950 font-semibold">{product.name}</span>
                      <div className="text-[10px] text-zinc-600 flex items-center gap-2">
                        {product.sku && <span>SKU: {product.sku}</span>}
                        {product.warranty && <span>· {product.warranty}</span>}
                      </div>
                    </div>
                    <span className="text-zinc-950 font-semibold tabular-nums shrink-0">
                      {formatCurrency(product.price || 0, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-zinc-200 pt-2.5 space-y-1 text-[11px] tabular-nums">
                <div className="flex justify-between text-zinc-600">
                  <span>Parts Subtotal ({quote.parts.length} components)</span>
                  <span>{formatCurrency(quote.subtotal, currencySymbol)}</span>
                </div>
                {quote.discountAmount > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>Full Rig Bundle Discount</span>
                    <span>-{formatCurrency(quote.discountAmount, currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-zinc-950 pt-1.5 border-t border-zinc-200">
                  <span>QUOTED RIG TOTAL (VAT Incl.)</span>
                  <span>{formatCurrency(quote.totalAmount, currencySymbol)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Admin Post-Sale Actions: RMA Replacement & Void/Refund */}
        {isReceipt && onOrderUpdated && !isVoided && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveAction(activeAction === 'rma' ? 'none' : 'rma');
                  if (!rmaProductId && order!.items[0]) {
                    setRmaProductId(order!.items[0].productId);
                    setDefectiveSerial(order!.items[0].serialNumbers?.[0] || '');
                  }
                }}
                className={`flex-1 py-2 px-3 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  activeAction === 'rma'
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-amber-900 dark:text-amber-300 font-semibold'
                    : 'bg-white dark:bg-carbon-elevated hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200'
                }`}
              >
                <Wrench className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                <span>RMA Defective Swap</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAction(activeAction === 'void' ? 'none' : 'void')}
                className={`flex-1 py-2 px-3 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  activeAction === 'void'
                    ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-800 dark:text-rose-200 font-semibold'
                    : 'bg-white dark:bg-carbon-elevated hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:text-rose-700 dark:hover:text-rose-300'
                }`}
              >
                <Ban className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" strokeWidth={1.75} />
                <span>Void / Refund Receipt</span>
              </button>
            </div>

            {activeAction === 'rma' && (
              <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-amber-300 dark:border-amber-500/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-zinc-950 dark:text-zinc-50 text-xs flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                    <span>Process Warranty RMA Unit Replacement</span>
                  </h4>
                  <span className="text-[10px] text-zinc-600 dark:text-zinc-400">Deducts 1 replacement unit</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label htmlFor="rma-product-select" className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Hardware Component on Receipt
                    </label>
                    <select
                      id="rma-product-select"
                      value={rmaProductId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setRmaProductId(pid);
                        const found = order!.items.find((i) => i.productId === pid);
                        setDefectiveSerial(found?.serialNumbers?.[0] || '');
                      }}
                      className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50"
                    >
                      {order!.items.map((item) => (
                        <option key={item.productId} value={item.productId}>
                          {item.productName} ({item.warranty || '1 Year Warranty'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="rma-defective-sn" className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Returned Defective S/N
                      </label>
                      <input
                        id="rma-defective-sn"
                        type="text"
                        value={defectiveSerial}
                        onChange={(e) => setDefectiveSerial(e.target.value)}
                        placeholder="Old S/N"
                        className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="rma-replacement-sn" className="block text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                        New Replacement Unit S/N *
                      </label>
                      <input
                        id="rma-replacement-sn"
                        type="text"
                        value={replacementSerial}
                        onChange={(e) => setReplacementSerial(e.target.value)}
                        placeholder="Scan or enter new S/N"
                        className="w-full bg-white dark:bg-carbon border border-amber-600 dark:border-amber-500 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="rma-issue-desc" className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Defect / Diagnostic Findings
                    </label>
                    <input
                      id="rma-issue-desc"
                      type="text"
                      value={rmaIssue}
                      onChange={(e) => setRmaIssue(e.target.value)}
                      placeholder="e.g. No display output / Dead on arrival"
                      className="w-full bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveAction('none')}
                    className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleConfirmRma}
                    className="px-3.5 py-1.5 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-xs cursor-pointer"
                  >
                    {busy ? 'Recording RMA...' : 'Confirm RMA Replacement'}
                  </button>
                </div>
              </div>
            )}

            {activeAction === 'void' && (
              <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 space-y-3">
                <h4 className="font-semibold text-rose-900 dark:text-rose-200 text-xs flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Void Receipt &amp; Refund Customer</span>
                </h4>

                <div>
                  <label htmlFor="void-reason-input" className="block text-[11px] font-medium text-rose-900 dark:text-rose-200 mb-1">
                    Reason for Void / Refund
                  </label>
                  <input
                    id="void-reason-input"
                    type="text"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="e.g. Customer changed mind / Cashier entry error"
                    className="w-full bg-white dark:bg-carbon border border-rose-300 dark:border-rose-700 rounded px-2.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50"
                  />
                </div>

                <label className="flex items-center gap-2 text-[11px] text-rose-900 dark:text-rose-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restockDamaged}
                    onChange={(e) => setRestockDamaged(e.target.checked)}
                    className="rounded border-rose-300 text-amber-600 focus:ring-amber-600"
                  />
                  <span>
                    Items returned opened/defective (do not restock into sellable inventory)
                  </span>
                </label>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveAction('none')}
                    className="px-3 py-1.5 rounded-md bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleConfirmVoid}
                    className="px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer"
                  >
                    {busy ? 'Processing Void...' : 'Confirm Void & Refund'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleCopySummary}
            className="px-3 py-2 rounded-md bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" strokeWidth={1.75} />
                <span className="text-emerald-800 dark:text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" strokeWidth={1.75} />
                <span>Copy Text</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownloadText}
            className="px-3 py-2 rounded-md bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Download (.txt)</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Print {isReceipt ? 'Receipt' : 'Quote'}</span>
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
