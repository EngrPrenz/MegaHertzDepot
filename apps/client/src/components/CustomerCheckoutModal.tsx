import React, { useState } from 'react';
import { ModalDialog } from './ModalDialog.js';
import { localRepository } from '../services/localRepository.js';
import { SaleOrderLocal, ProductLocal } from '../db/index.js';
import { PaymentMethod, formatCurrency } from '@countwise/shared';
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

export interface StorefrontCartItem {
  product: ProductLocal;
  quantity: number;
}

interface CustomerUser {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  address?: string;
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
      title={confirmedOrder ? 'Order Confirmed!' : 'Checkout & Place Order'}
      subtitle={
        confirmedOrder
          ? 'Your online order has been received by MegaHertz Depot.'
          : `Signed in as ${customer.name || customer.email}`
      }
    >
      {confirmedOrder ? (
        /* Order Success Confirmation Screen */
        <div className="space-y-5 text-center py-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-white">Thank You for Your Order!</h3>
            <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
              Order Receipt Number:{' '}
              <span className="font-mono font-bold text-amber-400">
                {confirmedOrder.receiptNumber}
              </span>
            </p>
          </div>

          {/* Fulfillment Instructions Card */}
          <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 text-left space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <span className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                {fulfillment === 'pickup' ? (
                  <>
                    <Store className="w-4 h-4 text-amber-400" />
                    In-Store Pickup Claim
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4 text-amber-400" />
                    Express Delivery Dispatch
                  </>
                )}
              </span>
              <span className="text-xs font-bold text-amber-400 font-mono">
                {formatCurrency(confirmedOrder.totalAmount, currencySymbol)}
              </span>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              {fulfillment === 'pickup'
                ? 'Your components are reserved at our MegaHertz Depot flagship store. Please present your Order Code to the cashier counter upon pickup.'
                : `Your order is scheduled for dispatch to ${address}, ${city}. Our courier will contact ${phone} before delivery.`}
            </p>

            <div className="flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-900">
              <span>Payment Mode: {confirmedOrder.paymentMethod}</span>
              <span>Items: {confirmedOrder.items.length} component(s)</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-xl transition"
            >
              <Printer className="w-4 h-4" />
              Print Receipt
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmedOrder(null);
                onClose();
              }}
              className="inline-flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/30 transition"
            >
              Done & Return to Store
            </button>
          </div>
        </div>
      ) : (
        /* Checkout Form */
        <form onSubmit={handlePlaceOrder} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Fulfillment Method Selection */}
          <div>
            <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
              1. Choose Fulfillment Method
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFulfillment('pickup')}
                className={`p-3.5 rounded-xl border flex flex-col items-start gap-1 text-left transition-all ${
                  fulfillment === 'pickup'
                    ? 'bg-amber-500/10 border-amber-500 text-white shadow'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Store className="w-4 h-4 text-amber-400" />
                  <span>In-Store Pickup</span>
                </div>
                <span className="text-[11px] text-stone-400">
                  Ready in 1 hr • Free pickup at store
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFulfillment('delivery')}
                className={`p-3.5 rounded-xl border flex flex-col items-start gap-1 text-left transition-all ${
                  fulfillment === 'delivery'
                    ? 'bg-amber-500/10 border-amber-500 text-white shadow'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Truck className="w-4 h-4 text-amber-400" />
                  <span>Door-to-Door Delivery</span>
                </div>
                <span className="text-[11px] text-stone-400">
                  Same-day / Next-day (₱150 shipping)
                </span>
              </button>
            </div>
          </div>

          {/* Delivery Details (if delivery selected) */}
          {fulfillment === 'delivery' ? (
            <div className="space-y-3 p-3.5 rounded-xl bg-stone-950 border border-stone-800">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-400 mb-1">
                    Contact Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0917-123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-400 mb-1">
                    City / Area *
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1">
                  Complete Delivery Address *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Unit/House No., Street, Barangay, Landmark"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <MapPin className="w-4 h-4" />
                Pickup Location: MegaHertz Depot — Flagship
              </div>
              <p className="text-[11px] text-stone-400">
                Unit 402 Gilmore Tech Center, Aurora Blvd, Quezon City. Operating hours: 9:00 AM – 7:00 PM.
              </p>
              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1">
                  Recipient Contact Phone
                </label>
                <input
                  type="tel"
                  placeholder="0917-123-4567 (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Payment Method Selection */}
          <div>
            <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
              2. Select Payment Mode
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPaymentMethod('Cash')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'Cash'
                    ? 'bg-amber-500/15 border-amber-500 text-white font-bold'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                <Banknote className="w-4 h-4 text-amber-400" />
                <span>{fulfillment === 'delivery' ? 'Cash on Delivery' : 'Pay at Counter'}</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('GCash')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'GCash'
                    ? 'bg-blue-950/60 border-blue-500 text-white font-bold'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4 text-blue-400" />
                <span>GCash QR</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('Maya')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'Maya'
                    ? 'bg-teal-950/60 border-teal-500 text-white font-bold'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4 text-teal-400" />
                <span>Maya Pay</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('Card')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  paymentMethod === 'Card'
                    ? 'bg-purple-950/60 border-purple-500 text-white font-bold'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-4 h-4 text-purple-400" />
                <span>Bank / Card</span>
              </button>
            </div>
          </div>

          {/* Optional Order Notes */}
          <div>
            <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
              3. Special Instructions / Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Please test AM5 BIOS update before pickup / Ring doorbell on arrival"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Order Summary Breakdown */}
          <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-stone-400">
              <span>Subtotal ({cart.length} item types)</span>
              <span className="font-mono text-white">
                {formatCurrency(subtotal, currencySymbol)}
              </span>
            </div>

            {deliveryFee > 0 && (
              <div className="flex justify-between text-stone-400">
                <span>Shipping & Delivery Fee</span>
                <span className="font-mono text-white">
                  {formatCurrency(deliveryFee, currencySymbol)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-stone-500 text-[11px] pt-1 border-t border-stone-900">
              <span>VAT Included (12%)</span>
              <span className="font-mono">{formatCurrency(taxAmount, currencySymbol)}</span>
            </div>

            <div className="flex justify-between text-base font-extrabold text-amber-400 pt-2 border-t border-stone-800">
              <span>Total Amount Due</span>
              <span className="font-mono">{formatCurrency(totalAmount, currencySymbol)}</span>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-400 hover:text-white"
            >
              Back to Cart
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-stone-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/40 transition disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Placing Order...' : 'Confirm & Place Order'}</span>
            </button>
          </div>
        </form>
      )}
    </ModalDialog>
  );
}
