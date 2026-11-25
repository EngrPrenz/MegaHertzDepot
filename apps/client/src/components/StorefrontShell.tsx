import React from 'react';
import { MegaHertzLogo } from './MegaHertzLogo.js';
import { ProductImage } from './ProductImage.js';
import { CustomerAuthModal } from './CustomerAuthModal.js';
import { CustomerCheckoutModal } from './CustomerCheckoutModal.js';
import { ThemeToggleButton } from './ThemeToggleButton.js';
import { useCustomerCart } from '../hooks/useCustomerCart.js';
import { formatCurrency } from '@countwise/shared';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  User,
  LogOut,
  X,
  ArrowRight,
  Wrench,
  CheckCircle2,
} from 'lucide-react';

interface StorefrontShellProps {
  storeId: string;
  currencySymbol: string;
  cartState: ReturnType<typeof useCustomerCart>;
  activeNav?: 'catalog' | 'builder';
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  onSearchSubmit?: (e: React.FormEvent) => void;
  searchPlaceholder?: string;
  onNavigateHome: () => void;
  onNavigateBuilder: () => void;
  children: React.ReactNode;
}

/**
 * Shared light/dark storefront chrome for Catalog (`/`), Product Detail (`/product/:id`), and PC Rig Builder (`/builder`).
 */
export function StorefrontShell({
  storeId,
  currencySymbol,
  cartState,
  activeNav = 'catalog',
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search RTX 5080, Ryzen 7, DDR5, SSD...',
  onNavigateHome,
  onNavigateBuilder,
  children,
}: StorefrontShellProps) {
  const {
    customer,
    cart,
    totalCartCount,
    totalCartAmount,
    isAuthOpen,
    setIsAuthOpen,
    isCartOpen,
    setIsCartOpen,
    isCheckoutOpen,
    setIsCheckoutOpen,
    toastMessage,
    updateQuantity,
    removeFromCart,
    handleAuthSuccess,
    logoutCustomer,
    handleOrderPlaced,
    openCheckout,
  } = cartState;

  const hasSearch = typeof searchValue === 'string' && typeof onSearchChange === 'function';

  const renderSearchField = (isMobile: boolean) => {
    const inputEl = (
      <div className="relative w-full">
        <Search
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 pointer-events-none"
          strokeWidth={1.75}
        />
        <input
          type="search"
          aria-label="Search PC hardware"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:border-amber-600 dark:focus:border-amber-500 focus:bg-white dark:focus:bg-zinc-900 transition-colors"
        />
      </div>
    );

    if (onSearchSubmit) {
      return (
        <form
          onSubmit={onSearchSubmit}
          className={isMobile ? 'md:hidden mt-2.5' : 'hidden md:flex flex-1 max-w-md'}
        >
          {inputEl}
        </form>
      );
    }

    return (
      <div className={isMobile ? 'md:hidden mt-2.5' : 'hidden md:flex flex-1 max-w-md'}>
        {inputEl}
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 flex flex-col">
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 shadow-lg text-xs font-medium border border-zinc-800 dark:border-zinc-300"
        >
          <CheckCircle2 className="w-4 h-4 text-amber-400 dark:text-amber-600 shrink-0" strokeWidth={1.75} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Compact single-row header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-carbon border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-4 min-w-0 shrink-0">
            <button
              type="button"
              onClick={onNavigateHome}
              className="shrink-0 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 rounded"
            >
              <MegaHertzLogo variant="horizontal" size="md" showSubtitle={false} />
            </button>

            <nav aria-label="Store navigation" className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={onNavigateHome}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeNav === 'catalog'
                    ? 'bg-zinc-100 dark:bg-carbon-elevated text-zinc-950 dark:text-zinc-50 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                }`}
              >
                Hardware Catalog
              </button>
              <button
                type="button"
                onClick={onNavigateBuilder}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeNav === 'builder'
                    ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40 font-semibold'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                }`}
              >
                <Wrench className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                <span>Rig Builder</span>
              </button>
            </nav>
          </div>

          {hasSearch && renderSearchField(false)}

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeToggleButton />

            {customer ? (
              <div className="flex items-center gap-1 text-xs">
                <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md bg-zinc-100 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200">
                  <User className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" strokeWidth={1.75} />
                  <span className="font-medium truncate max-w-[64px] sm:max-w-[130px]">
                    {customer.name || customer.email.split('@')[0]}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={logoutCustomer}
                  title="Sign out"
                  aria-label="Sign out"
                  className="p-1.5 rounded-md bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="px-2 sm:px-3 py-1.5 rounded-md bg-white dark:bg-carbon hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" strokeWidth={1.75} />
                <span>Sign In</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-md bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.98] text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Cart</span>
              {totalCartCount > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-amber-500 text-zinc-950 font-mono text-[11px] font-semibold tabular-nums">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Secondary Row: Navigation + Optional Search */}
        <div className="sm:hidden mt-2 flex items-center gap-2">
          <nav
            aria-label="Mobile store navigation"
            className="grid grid-cols-2 gap-1 bg-zinc-100 dark:bg-carbon-elevated p-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 shrink-0"
          >
            <button
              type="button"
              onClick={onNavigateHome}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                activeNav === 'catalog'
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                  : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              Catalog
            </button>
            <button
              type="button"
              onClick={onNavigateBuilder}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold whitespace-nowrap inline-flex items-center justify-center gap-1 cursor-pointer ${
                activeNav === 'builder'
                  ? 'bg-amber-500 text-zinc-950'
                  : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <Wrench className="w-3 h-3" strokeWidth={1.75} />
              <span>Builder</span>
            </button>
          </nav>

          {hasSearch && (
            onSearchSubmit ? (
              <form onSubmit={onSearchSubmit} className="flex-1 min-w-0">
                <div className="relative w-full">
                  <Search
                    className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 pointer-events-none"
                    strokeWidth={1.75}
                  />
                  <input
                    type="search"
                    aria-label="Search PC hardware"
                    placeholder="Search parts..."
                    value={searchValue}
                    onChange={(e) => onSearchChange?.(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:border-amber-600 focus:bg-white dark:focus:bg-zinc-900"
                  />
                </div>
              </form>
            ) : (
              <div className="flex-1 min-w-0 relative">
                <Search
                  className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 pointer-events-none"
                  strokeWidth={1.75}
                />
                <input
                  type="search"
                  aria-label="Search PC hardware"
                  placeholder="Search parts..."
                  value={searchValue}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded text-xs text-zinc-950 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:border-amber-600 focus:bg-white dark:focus:bg-zinc-900"
                />
              </div>
            )
          )}
        </div>

        {/* Tablet search row (between sm and md breakpoints) */}
        {hasSearch && <div className="hidden sm:block md:hidden">{renderSearchField(true)}</div>}
      </header>

      <div className="flex-1 flex flex-col">{children}</div>

      {/* Single-row Store Info & Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-carbon py-6 px-4 sm:px-6 text-xs text-zinc-600 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MegaHertzLogo variant="horizontal" size="sm" showSubtitle={false} />
            <span className="text-zinc-500 dark:text-zinc-400">
              Unit 402 Gilmore Tech Center, Quezon City · Official distributor warranties
            </span>
          </div>

          <div className="text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>In-store pickup &amp; Metro Manila delivery</span>
            <span>© {new Date().getFullYear()} MegaHertz Depot</span>
          </div>
        </div>
      </footer>

      {/* Slide-out Cart Drawer */}
      {isCartOpen && (
        <div
          className="fixed inset-0 z-50 overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Shopping cart"
        >
          <div
            className="absolute inset-0 bg-zinc-950/45 dark:bg-black/70 transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-8">
            <div className="w-screen max-w-md bg-white dark:bg-carbon border-l border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 flex flex-col justify-between shadow-2xl">
              <div className="min-h-0 flex flex-col flex-1">
                <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-zinc-900 dark:text-zinc-100" strokeWidth={1.75} />
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      Shopping Cart
                    </h3>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-zinc-100 dark:bg-carbon-elevated text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 tabular-nums">
                      {totalCartCount}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCartOpen(false)}
                    aria-label="Close cart"
                    className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>

                <div className="divide-y divide-zinc-200 dark:divide-zinc-800 overflow-y-auto mt-2 pr-1 flex-1">
                  {cart.length === 0 ? (
                    <div className="py-16 text-center space-y-2">
                      <ShoppingCart className="w-9 h-9 text-zinc-300 dark:text-zinc-700 mx-auto" strokeWidth={1.5} />
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        Your cart is empty
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Add hardware components or assemble a custom build to check out.
                      </p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.product.id} className="py-3 flex items-center gap-3">
                        <ProductImage
                          imageUrl={item.product.imageUrl}
                          sku={item.product.sku}
                          name={item.product.name}
                          category={item.product.category}
                          className="w-12 h-12 shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 truncate">
                            {item.product.name}
                          </h4>
                          <div className="text-xs font-semibold text-zinc-900 dark:text-amber-400 font-mono tabular-nums mt-0.5">
                            {formatCurrency(
                              (item.product.price || 0) * item.quantity,
                              currencySymbol
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 bg-zinc-50 dark:bg-carbon-elevated border border-zinc-200 dark:border-zinc-700 rounded p-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, -1)}
                            aria-label="Decrease quantity"
                            className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" strokeWidth={1.75} />
                          </button>
                          <span className="font-mono text-xs font-medium text-zinc-950 dark:text-zinc-50 px-1.5 tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, 1)}
                            aria-label="Increase quantity"
                            className="p-1 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" strokeWidth={1.75} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          aria-label={`Remove ${item.product.name}`}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {cart.length > 0 && (
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-400">Order Subtotal</span>
                    <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 font-mono tabular-nums">
                      {formatCurrency(totalCartAmount, currencySymbol)}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    VAT included. Choose Gilmore pickup or Metro Manila delivery on checkout.
                  </p>

                  <button
                    type="button"
                    onClick={openCheckout}
                    className="w-full py-2.5 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] text-white dark:text-zinc-950 font-semibold text-xs rounded-md flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CustomerAuthModal
        open={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {customer && (
        <CustomerCheckoutModal
          open={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          storeId={storeId}
          customer={customer}
          cart={cart}
          onOrderPlaced={handleOrderPlaced}
          currencySymbol={currencySymbol}
        />
      )}
    </div>
  );
}
