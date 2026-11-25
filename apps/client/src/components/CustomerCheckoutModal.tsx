import React, { useState } from 'react';
import { ModalDialog } from './ModalDialog.js';
import { localRepository } from '../services/localRepository.js';
import { localDb, SaleOrderLocal, ProductLocal } from '../db/index.js';
import { PaymentMethod, formatCurrency } from '@countwise/shared';
import type { CustomerUser } from '../hooks/useCustomerCart.js';
import {
  Truck,
  Store,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Printer,
} from 'lucide-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StorefrontCartItem {
  product: ProductLocal;
  quantity: number;
}

interface CustomerCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  customer: CustomerUser;
  cart: StorefrontCartItem[];
  onOrderPlaced: (order: SaleOrderLocal) => void;
  currencySymbol?: string;
}

export function CustomerCheckoutModal({
  open,
  onClose,
  storeId,
  customer,
  cart,
  onOrderPlaced,
  currencySymbol = '₱',
}: CustomerCheckoutModalProps) {
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [phone, setPhone] = useState(customer.phone || '');
  const [address, setAddress] = useState(customer.address || '');
  const [city, setCity] = useState('Metro Manila');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<SaleOrderLocal | null>(null);

  const subtotal = cart.reduce(
    (sum, item) => sum + (item.product.price || 0) * item.quantity,
    0
  );
  const deliveryFee = fulfillment === 'delivery' ? 150 : 0;
  const totalAmount = subtotal + deliveryFee;

  // 12% inclusive Philippine VAT calculation
  const taxRate = 12;
  const taxInclusive = true;
  const netOfVat = subtotal / (1 + taxRate / 100);
  const taxAmount = subtotal - netOfVat;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cart.length === 0) {
      setError('Your shopping cart is empty.');
      return;
    }

    if (fulfillment === 'delivery' && (!address.trim() || !phone.trim())) {
      setError('Please provide your complete delivery address and contact phone number.');
      return;
    }

    setSubmitting(true);

    try {
      const orderItems = cart.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        category: item.product.category,
        warranty: item.product.warranty,
        quantity: item.quantity,
        unitPrice: item.product.price || 0,
        serialNumbers: [],
      }));

      const fullNotes = [
        `[ONLINE ORDER - ${fulfillment.toUpperCase()}]`,
        fulfillment === 'delivery' ? `Delivery Address: ${address.trim()}, ${city.trim()}` : 'In-Store Pickup',
        notes.trim() ? `Customer Notes: ${notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      if (navigator.onLine) {
        try {
          const validEmail =
            customer.email && EMAIL_REGEX.test(customer.email.trim())
              ? customer.email.trim()
              : undefined;
          const validStoreId = UUID_REGEX.test(storeId) ? storeId : undefined;

          const response = await fetch('/public/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId: validStoreId,
              customerName: customer.name || customer.email.split('@')[0],
              customerEmail: validEmail,
              customerPhone: phone.trim() || undefined,
              fulfillment,
              address: address.trim() || undefined,
              city: city.trim() || undefined,
              notes: notes.trim() || undefined,
              paymentMethod,
              items: cart.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
              })),
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data?.order) {
            const remote = data.order;
            const savedOrder: SaleOrderLocal = {
              id: remote.id,
              storeId: remote.storeId,
              receiptNumber: remote.receiptNumber,
              customerName: remote.customerName ?? undefined,
              customerPhone: remote.customerPhone ?? undefined,
              items: remote.items,
              subtotal: Number(remote.subtotal),
              discountAmount: Number(remote.discountAmount ?? 0),
              taxRate: Number(remote.taxRate ?? taxRate),
              taxInclusive: Boolean(remote.taxInclusive ?? taxInclusive),
              taxAmount: Number(remote.taxAmount ?? 0),
              totalAmount: Number(remote.totalAmount),
              paymentMethod: remote.paymentMethod,
              amountTendered: Number(remote.amountTendered),
              changeDue: Number(remote.changeDue ?? 0),
              notes: remote.notes ?? undefined,
              createdAt: Number(remote.createdAt),
              hlc: remote.hlc,
              deviceId: remote.deviceId,
              userId: remote.userId,
              serverSeq: remote.serverSeq,
            };
            await localDb.orders.put(savedOrder);
            setConfirmedOrder(savedOrder);
            onOrderPlaced(savedOrder);
            return;
          }
          if (response.status >= 400 && response.status < 500) {
            const firstIssue =
              Array.isArray(data?.details) && data.details.length > 0 ? data.details[0] : null;
            const detailMsg = firstIssue
              ? `${data?.error || 'Validation error'}: ${
                  Array.isArray(firstIssue.path) && firstIssue.path.length > 0
                    ? `${firstIssue.path.join('.')} - `
                    : ''
                }${firstIssue.message}`
              : data?.error || 'Order could not be placed.';
            throw new Error(detailMsg);
          }
        } catch (err: any) {
          if (
            err instanceof Error &&
            err.name !== 'TypeError' &&
            !err.message?.toLowerCase().includes('failed to fetch')
          ) {
            throw err;
          }
        }
      }

      const order = await localRepository.createSaleOrder({
        storeId,
        customerName: customer.name || customer.email.split('@')[0],
        customerPhone: phone.trim() || undefined,
        items: orderItems,
        subtotal,
        discountAmount: 0,
        taxRate,
        taxInclusive,
        taxAmount,
        totalAmount,
        paymentMethod,
        amountTendered: totalAmount,
        changeDue: 0,
        notes: fullNotes,
        userId: customer.id,
      });

      setConfirmedOrder(order);
      onOrderPlaced(order);
    } catch (err: any) {
      setError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalDialog
      open={open}
      onClose={() => {
        if (!confirmedOrder) onClose();
        else {
          setConfirmedOrder(null);
          onClose();
        }
      }}
      title={confirmedOrder ? 'Order Confirmed' : 'Checkout & Place Order'}
      subtitle={
        confirmedOrder
          ? 'Your order has been logged with MegaHertz Depot.'
          : `Signed in as ${customer.name || customer.email}`
      }
      maxWidth="lg"
    >
      {confirmedOrder ? (
        <div className="space-y-4 text-center py-2">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 mx-auto">
            <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Thank You for Your Order</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              Order Receipt Number:{' '}
              <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                {confirmedOrder.receiptNumber}
              </span>
            </p>
          </div>

          <div className="p-4 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 text-left space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                {fulfillment === 'pickup' ? (
                  <>
                    <Store className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                    <span>In-Store Pickup Claim</span>
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                    <span>Express Delivery Dispatch</span>
                  </>
                )}
              </span>
              <span className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 font-mono tabular-nums">
                {formatCurrency(confirmedOrder.totalAmount, currencySymbol)}
              </span>
            </div>

            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {fulfillment === 'pickup'
                ? 'Your components are reserved at MegaHertz Depot Gilmore. Present your Order Code at the pickup counter.'
                : `Scheduled for dispatch to ${address}, ${city}. Our courier will contact ${phone} prior to delivery.`}
            </p>

            <div className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span>Payment Mode: {confirmedOrder.paymentMethod}</span>
              <span className="tabular-nums">Items: {confirmedOrder.items.length} line(s)</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-medium rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" strokeWidth={1.75} />
              <span>Print Receipt</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmedOrder(null);
                onClose();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              Done &amp; Return to Store
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handlePlaceOrder} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700 dark:text-rose-400" strokeWidth={1.75} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">1. Fulfillment Method</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setFulfillment('pickup')}
                className={`p-3 rounded-md border flex flex-col items-start gap-1 text-left transition-colors cursor-pointer ${
                  fulfillment === 'pickup'
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-zinc-950 dark:text-zinc-50'
                    : 'bg-white dark:bg-carbon border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <Store className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                  <span>In-Store Pickup</span>
                </div>
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Ready in 1 hr · Free pickup in Gilmore
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFulfillment('delivery')}
                className={`p-3 rounded-md border flex flex-col items-start gap-1 text-left transition-colors cursor-pointer ${
                  fulfillment === 'delivery'
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-zinc-950 dark:text-zinc-50'
                    : 'bg-white dark:bg-carbon border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <Truck className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                  <span>Door-to-Door Delivery</span>
                </div>
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Same-day / Next-day (₱150 shipping)
                </span>
              </button>
            </div>
          </div>

          {fulfillment === 'delivery' ? (
            <div className="space-y-3 p-3.5 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="checkout-phone" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Contact Phone *
                  </label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="0917-123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-amber-600"
                  />
                </div>
                <div>
                  <label htmlFor="checkout-city" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    City / Area *
                  </label>
                  <input
                    id="checkout-city"
                    type="text"
                    required
                    autoComplete="address-level2"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="checkout-address" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Complete Delivery Address *
                </label>
                <textarea
                  id="checkout-address"
                  rows={2}
                  required
                  autoComplete="street-address"
                  placeholder="Unit/House No., Street, Barangay, Landmark"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-amber-600"
                />
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <MapPin className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                <span>Pickup Location: MegaHertz Depot Flagship</span>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Unit 402 Gilmore Tech Center, Aurora Blvd, Quezon City. Open 9:00 AM - 7:00 PM.
              </p>
              <div>
                <label htmlFor="pickup-phone" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Recipient Contact Phone
                </label>
                <input
                  id="pickup-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="0917-123-4567 (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-carbon border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:border-amber-600"
                />
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-2">2. Payment Mode</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPaymentMethod('Cash')}
                className={`p-2.5 rounded-md border flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                  paymentMethod === 'Cash'
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-zinc-950 dark:text-zinc-50 font-semibold'
                    : 'bg-white dark:bg-carbon border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <Banknote className="w-4 h-4 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                <span>{fulfillment === 'delivery' ? 'Cash on Delivery' : 'Pay at Counter'}</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('GCash')}
                className={`p-2.5 rounded-md border flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                  paymentMethod === 'GCash'
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-zinc-950 dark:text-zinc-50 font-semibold'
                    : 'bg-white dark:bg-carbon border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <Smartphone className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
                <span>GCash QR</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('Maya')}
                className={`p-2.5 rounded-md border flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                  paymentMethod === 'Maya'
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-zinc-950 dark:text-zinc-50 font-semibold'
                    : 'bg-white dark:bg-carbon border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <Smartphone className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
                <span>Maya Pay</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('Card')}
                className={`p-2.5 rounded-md border flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                  paymentMethod === 'Card'
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-600 dark:border-amber-500 text-zinc-950 dark:text-zinc-50 font-semibold'
                    : 'bg-white dark:bg-carbon border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <CreditCard className="w-4 h-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
                <span>Bank / Card</span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="checkout-notes" className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
              3. Order Notes (Optional)
            </label>
            <textarea
              id="checkout-notes"
              rows={2}
              placeholder="e.g. Please test AM5 BIOS update before pickup"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:border-amber-600"
            />
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Subtotal ({cart.length} item types)</span>
              <span className="font-mono text-zinc-950 dark:text-zinc-50 tabular-nums">
                {formatCurrency(subtotal, currencySymbol)}
              </span>
            </div>

            {deliveryFee > 0 && (
              <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                <span>Shipping &amp; Delivery Fee</span>
                <span className="font-mono text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {formatCurrency(deliveryFee, currencySymbol)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-zinc-600 dark:text-zinc-400 text-[11px] pt-1 border-t border-zinc-200 dark:border-zinc-800">
              <span>VAT Included (12%)</span>
              <span className="font-mono tabular-nums">{formatCurrency(taxAmount, currencySymbol)}</span>
            </div>

            <div className="flex justify-between text-sm font-semibold text-zinc-950 dark:text-zinc-50 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span>Total Amount Due</span>
              <span className="font-mono tabular-nums">{formatCurrency(totalAmount, currencySymbol)}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer"
            >
              Back to Cart
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] text-white dark:text-zinc-950 text-xs font-semibold rounded-md transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
              <span>{submitting ? 'Placing Order...' : 'Confirm & Place Order'}</span>
            </button>
          </div>
        </form>
      )}
    </ModalDialog>
  );
}
