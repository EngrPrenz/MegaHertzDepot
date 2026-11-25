import React, { useState } from 'react';
import { ModalDialog } from './ModalDialog.js';
import { Mail, Lock, User, ArrowRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { CustomerUser } from '../hooks/useCustomerCart.js';

interface CustomerAuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (customer: CustomerUser, token: string) => void;
  initialMode?: 'login' | 'register' | 'guest';
}

export function CustomerAuthModal({
  open,
  onClose,
  onSuccess,
  initialMode = 'login',
}: CustomerAuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'guest'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'guest') {
      if (!email.trim() || !name.trim()) {
        setError('Please provide your name and email address for order updates.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('Please enter a valid email address (e.g. juan@example.com).');
        return;
      }
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const guestUser: CustomerUser = {
        id: guestId,
        email: email.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      };
      const guestToken = `guest_token_${guestId}`;
      localStorage.setItem('megahertz_customer_user', JSON.stringify(guestUser));
      localStorage.setItem('megahertz_customer_token', guestToken);
      onSuccess(guestUser, guestToken);
      onClose();
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError('Please provide email and password.');
      return;
    }

    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/auth/customer/login' : '/auth/customer/register';
      const body =
        mode === 'login'
          ? { email: email.trim(), password }
          : { email: email.trim(), password, name: name.trim() || 'Online Customer' };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error && data.error.includes('already exists') && mode === 'register') {
          throw new Error('An account with this email already exists. Please sign in instead.');
        }
        throw new Error(data.error || 'Authentication failed');
      }

      const customer: CustomerUser = {
        id: data.user.id,
        email: data.user.email,
        name: name.trim() || data.user.name || email.split('@')[0],
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      };

      localStorage.setItem('megahertz_customer_user', JSON.stringify(customer));
      localStorage.setItem('megahertz_customer_token', data.accessToken);

      onSuccess(customer, data.accessToken);
      onClose();
    } catch (err: any) {
      if (err.message && (err.message.includes('fetch') || err.message.includes('Failed to fetch'))) {
        const fallbackId = `offline_cust_${Date.now()}`;
        const fallbackUser: CustomerUser = {
          id: fallbackId,
          email: email.trim(),
          name: name.trim() || email.split('@')[0],
        };
        const fallbackToken = `offline_customer_token_${fallbackId}`;
        localStorage.setItem('megahertz_customer_user', JSON.stringify(fallbackUser));
        localStorage.setItem('megahertz_customer_token', fallbackToken);
        onSuccess(fallbackUser, fallbackToken);
        onClose();
        return;
      }
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={
        mode === 'login'
          ? 'Sign In to Your Account'
          : mode === 'register'
          ? 'Create Customer Account'
          : 'Quick Checkout Details'
      }
      subtitle="Sign in or enter your contact details to place and track orders."
    >
      <div className="space-y-4">
        <div className="flex rounded-md bg-zinc-100 dark:bg-carbon-elevated p-1 border border-zinc-200 dark:border-zinc-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 font-semibold shadow-xs border border-zinc-200 dark:border-zinc-700'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 font-semibold shadow-xs border border-zinc-200 dark:border-zinc-700'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
            }`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('guest');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded transition-colors cursor-pointer ${
              mode === 'guest'
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 font-semibold shadow-xs border border-zinc-200 dark:border-zinc-700'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
            }`}
          >
            Guest
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700 dark:text-rose-400" strokeWidth={1.75} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode !== 'login' && (
            <div>
              <label htmlFor="cust-name" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Full Name *
              </label>
              <div className="relative">
                <User
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                  strokeWidth={1.75}
                />
                <input
                  id="cust-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Juan dela Cruz"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:border-amber-600 dark:focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="cust-email" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Email Address *
            </label>
            <div className="relative">
              <Mail
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                strokeWidth={1.75}
              />
              <input
                id="cust-email"
                type="email"
                required
                autoComplete="email"
                placeholder="juan@example.ph"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:border-amber-600 dark:focus:border-amber-500"
              />
            </div>
          </div>

          {mode !== 'guest' ? (
            <div>
              <label htmlFor="cust-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Password *
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                  strokeWidth={1.75}
                />
                <input
                  id="cust-password"
                  type="password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:border-amber-600 dark:focus:border-amber-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="cust-phone" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Mobile Number (for order updates)
                </label>
                <input
                  id="cust-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="0917-123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:border-amber-600 dark:focus:border-amber-500"
                />
              </div>
              <div>
                <label htmlFor="cust-address" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Delivery Address (optional)
                </label>
                <input
                  id="cust-address"
                  type="text"
                  autoComplete="street-address"
                  placeholder="Street, City, Metro Manila"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 focus:outline-none focus:border-amber-600 dark:focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] text-white dark:text-zinc-950 font-semibold rounded-md text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              <span>
                {loading
                  ? 'Processing...'
                  : mode === 'login'
                  ? 'Sign In & Continue'
                  : mode === 'register'
                  ? 'Create Account & Continue'
                  : 'Continue as Guest'}
              </span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </form>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 pt-2.5 border-t border-zinc-200 dark:border-zinc-800">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
          <span>Customer details are kept private for order fulfillment.</span>
        </div>
      </div>
    </ModalDialog>
  );
}
