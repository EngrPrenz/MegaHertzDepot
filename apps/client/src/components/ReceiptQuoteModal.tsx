import { ModalDialog } from './ModalDialog.js';
import { SaleOrderLocal, ProductLocal } from '../db/index.js';
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
}

export function ReceiptQuoteModal({
  open,
  onClose,
  storeName,
  currencySymbol,
  order,
  quote,
}: ReceiptQuoteModalProps) {
  if (!order && !quote) return null;

  const isReceipt = Boolean(order);
  const title = isReceipt
    ? `Official Receipt • ${order!.receiptNumber}`
    : `PC Build Quotation • ${quote!.quoteNumber}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadText = () => {
    const lines: string[] = [];
    lines.push('====================================================');
    lines.push(`        MEGAHERTZ DEPOT — ${storeName.toUpperCase()}`);
    lines.push('   Computer Hardware, Custom Rigs & Peripherals');
    lines.push('====================================================');

    if (order) {
      lines.push(`OFFICIAL RECEIPT #: ${order.receiptNumber}`);
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
      lines.push('====================================================');
      lines.push('WARRANTY TERMS: Present this receipt & matching S/N');
      lines.push('for all hardware RMA and supplier warranty claims.');
    } else if (quote) {
      lines.push(`PC BUILD QUOTATION #: ${quote.quoteNumber}`);
      lines.push(`DATE: ${new Date(quote.createdAt).toLocaleString()}`);
      if (quote.customerName) lines.push(`PREPARED FOR: ${quote.customerName}`);
      lines.push(
        `COMPATIBILITY: ${
          quote.compatibility.isCompatible ? 'VERIFIED COMPATIBLE' : 'HAS WARNINGS'
        } (${quote.compatibility.estimatedSystemWatts}W Est. Load)`
      );
      lines.push('----------------------------------------------------');
      for (const entry of quote.parts) {
        lines.push(
          `[${entry.slot}] ${entry.product.name} — ${formatCurrency(
            entry.product.price || 0,
            currencySymbol
          )}`
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
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isReceipt
      ? `${order!.receiptNumber}-receipt.txt`
      : `${quote!.quoteNumber}-pc-quote.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle="MegaHertz Depot Official Hardware Documentation"
    >
      <div className="space-y-4 text-xs">
        {/* Printable Receipt / Quote Paper Container */}
        <div
          data-testid="receipt-document"
          className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-3 font-mono"
        >
          <div className="text-center border-b border-stone-800 pb-3">
            <div className="inline-flex items-center gap-1.5 text-amber-400 font-bold text-sm">
              <Cpu className="w-4 h-4" />
              <span>MEGAHERTZ DEPOT</span>
            </div>
            <p className="text-[11px] text-stone-400">{storeName} • PC Hardware & Peripherals</p>
            <p className="text-[10px] text-stone-500 mt-0.5">
              {isReceipt
                ? `Receipt: ${order!.receiptNumber} • ${new Date(
                    order!.createdAt
                  ).toLocaleString()}`
                : `Quote: ${quote!.quoteNumber} • ${new Date(quote!.createdAt).toLocaleString()}`}
            </p>
          </div>

          {order && (
            <>
              {(order.customerName || order.customerPhone) && (
                <div className="text-[11px] text-stone-300 border-b border-stone-800/80 pb-2">
                  {order.customerName && <div>Customer: {order.customerName}</div>}
                  {order.customerPhone && <div>Contact: {order.customerPhone}</div>}
                </div>
              )}

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {order.items.map((item, idx) => (
                  <div key={`${item.productId}-${idx}`} className="space-y-0.5">
                    <div className="flex justify-between text-stone-100 font-semibold">
                      <span>
                        {item.quantity}x {item.productName}
                      </span>
                      <span className="text-amber-400">
                        {formatCurrency(item.quantity * item.unitPrice, currencySymbol)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-stone-400">
                      {item.sku && <span>SKU: {item.sku}</span>}
                      {item.warranty && (
                        <span className="text-amber-400">• {item.warranty}</span>
                      )}
                    </div>
                    {item.serialNumbers && item.serialNumbers.filter(Boolean).length > 0 && (
                      <div className="text-[10px] text-amber-300 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/40">
                        S/N: {item.serialNumbers.filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-stone-800 pt-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between text-stone-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(order.subtotal, currencySymbol)}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Discount</span>
                    <span>-{formatCurrency(order.discountAmount, currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-400">
                  <span>
                    VAT ({order.taxRate}% {order.taxInclusive ? 'Included' : 'Added'})
                  </span>
                  <span>{formatCurrency(order.taxAmount, currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-stone-800">
                  <span>TOTAL ({order.paymentMethod})</span>
                  <span className="text-amber-400">
                    {formatCurrency(order.totalAmount, currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between text-stone-400 text-[10px]">
                  <span>Tendered: {formatCurrency(order.amountTendered, currencySymbol)}</span>
                  <span>Change: {formatCurrency(order.changeDue, currencySymbol)}</span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-800/40 text-[10px] text-amber-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Official Warranty Slip: Keep this receipt number ({order.receiptNumber}) and
                  recorded Serial Numbers for RMA service.
                </span>
              </div>
            </>
          )}

          {quote && (
            <>
              <div className="flex items-center justify-between text-[11px] pb-2 border-b border-stone-800">
                <span className="text-stone-300">
                  For: <strong>{quote.customerName || 'Walk-in PC Builder'}</strong>
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                    quote.compatibility.isCompatible
                      ? 'bg-amber-950/60 text-amber-300 border border-amber-700/60'
                      : 'bg-red-950/60 text-red-300 border border-red-700/60'
                  }`}
                >
                  {quote.compatibility.isCompatible ? (
                    <CheckCircle2 className="w-3 h-3 text-amber-400" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                  )}
                  {quote.compatibility.estimatedSystemWatts}W Est. Load
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {quote.parts.map(({ slot, product }) => (
                  <div key={slot} className="flex justify-between gap-2 text-[11px]">
                    <div className="min-w-0">
                      <span className="text-amber-400 font-semibold">[{slot}]</span>{' '}
                      <span className="text-stone-200">{product.name}</span>
                      {product.warranty && (
                        <div className="text-[10px] text-stone-500">{product.warranty}</div>
                      )}
                    </div>
                    <span className="text-amber-400 font-semibold shrink-0">
                      {formatCurrency(product.price || 0, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-stone-800 pt-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between text-stone-400">
                  <span>Parts Subtotal</span>
                  <span>{formatCurrency(quote.subtotal, currencySymbol)}</span>
                </div>
                {quote.discountAmount > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Full Rig Bundle Discount</span>
                    <span>-{formatCurrency(quote.discountAmount, currencySymbol)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-stone-800">
                  <span>QUOTED RIG TOTAL</span>
                  <span className="text-amber-400">
                    {formatCurrency(quote.totalAmount, currencySymbol)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDownloadText}
            className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download (.txt)</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-md shadow-amber-950/40"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print {isReceipt ? 'Receipt' : 'Quote'}</span>
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

