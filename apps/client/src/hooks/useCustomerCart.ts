import { useState, useEffect, useCallback, useRef } from 'react';
import { ProductLocal, SaleOrderLocal } from '../db/index.js';
import { StorefrontCartItem } from '../components/CustomerCheckoutModal.js';
import {
  decrementCachedPublicStock,
  safeJsonParse,
} from '../services/publicCatalogSync.js';

export interface CustomerUser {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  address?: string;
}

const CUSTOMER_USER_KEY = 'megahertz_customer_user';
const CUSTOMER_TOKEN_KEY = 'megahertz_customer_token';
const CUSTOMER_CART_KEY = 'megahertz_customer_cart';
const CART_UPDATED_EVENT = 'megahertz-cart-updated';

/**
 * Shared customer authentication and cart state across Storefront, Product Detail, and Rig Builder.
 */
export function useCustomerCart() {
  const [customer, setCustomer] = useState<CustomerUser | null>(() =>
    safeJsonParse<CustomerUser | null>(localStorage.getItem(CUSTOMER_USER_KEY), null)
  );
  const [cart, setCart] = useState<StorefrontCartItem[]>(() =>
    safeJsonParse<StorefrontCartItem[]>(localStorage.getItem(CUSTOMER_CART_KEY), [])
  );
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<{ product: ProductLocal; qty: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const persistCart = useCallback((nextCart: StorefrontCartItem[]) => {
    setCart(nextCart);
    localStorage.setItem(CUSTOMER_CART_KEY, JSON.stringify(nextCart));
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      setCart(safeJsonParse<StorefrontCartItem[]>(localStorage.getItem(CUSTOMER_CART_KEY), []));
      setCustomer(safeJsonParse<CustomerUser | null>(localStorage.getItem(CUSTOMER_USER_KEY), null));
    };

    const handleExternalCartUpdate = () => {
      const parsed = safeJsonParse<StorefrontCartItem[] | null>(
        localStorage.getItem(CUSTOMER_CART_KEY),
        null
      );
      if (parsed) {
        setCart(parsed);
        setIsCartOpen(true);
      }
    };

    window.addEventListener(CART_UPDATED_EVENT, handleExternalCartUpdate);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleExternalCartUpdate);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  const mergeProductIntoCart = useCallback(
    (baseCart: StorefrontCartItem[], product: ProductLocal, qty: number) => {
      const existingIndex = baseCart.findIndex((item) => item.product.id === product.id);
      if (existingIndex >= 0) {
        return baseCart.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: item.quantity + qty } : item
        );
      }
      return [...baseCart, { product, quantity: qty }];
    },
    []
  );

  const addToCart = useCallback(
    (product: ProductLocal, qty = 1): boolean => {
      if (!customer) {
        setPendingAdd({ product, qty });
        setIsAuthOpen(true);
        return false;
      }
      const nextCart = mergeProductIntoCart(cart, product, qty);
      persistCart(nextCart);
      showToast(qty > 1 ? `Added ${qty}x ${product.name} to cart` : `Added ${product.name} to cart`);
      return true;
    },
    [customer, cart, mergeProductIntoCart, persistCart, showToast]
  );

  const buyNow = useCallback(
    (product: ProductLocal, qty = 1) => {
      if (!customer) {
        setPendingAdd({ product, qty });
        setIsAuthOpen(true);
        return;
      }
      const nextCart = mergeProductIntoCart(cart, product, qty);
      persistCart(nextCart);
      setIsCheckoutOpen(true);
    },
    [customer, cart, mergeProductIntoCart, persistCart]
  );

  const addPartsToCart = useCallback(
    (parts: ProductLocal[]) => {
      if (parts.length === 0) return;
      let nextCart = [...cart];
      for (const part of parts) {
        nextCart = mergeProductIntoCart(nextCart, part, 1);
      }
      persistCart(nextCart);
      setIsCartOpen(true);
      showToast(`Added ${parts.length} build component${parts.length > 1 ? 's' : ''} to cart`);
    },
    [cart, mergeProductIntoCart, persistCart, showToast]
  );

  const updateQuantity = useCallback(
    (productId: string, delta: number) => {
      const nextCart = cart
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is StorefrontCartItem => item !== null);
      persistCart(nextCart);
    },
    [cart, persistCart]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      persistCart(cart.filter((item) => item.product.id !== productId));
    },
    [cart, persistCart]
  );

  const handleAuthSuccess = useCallback(
    (user: CustomerUser, _token: string) => {
      setCustomer(user);
      showToast(`Signed in as ${user.name || user.email}`);
      if (pendingAdd) {
        const { product, qty } = pendingAdd;
        setPendingAdd(null);
        const nextCart = mergeProductIntoCart(cart, product, qty);
        persistCart(nextCart);
        showToast(qty > 1 ? `Added ${qty}x ${product.name} to cart` : `Added ${product.name} to cart`);
      }
    },
    [pendingAdd, cart, mergeProductIntoCart, persistCart, showToast]
  );

  const logoutCustomer = useCallback(() => {
    setCustomer(null);
    localStorage.removeItem(CUSTOMER_USER_KEY);
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    showToast('Signed out of customer account.');
  }, [showToast]);

  const handleOrderPlaced = useCallback(
    (order: SaleOrderLocal) => {
      persistCart([]);
      setIsCartOpen(false);
      void decrementCachedPublicStock(order.items);
    },
    [persistCart]
  );

  const openCheckout = useCallback(() => {
    if (!customer) {
      setIsAuthOpen(true);
      return;
    }
    setIsCheckoutOpen(true);
  }, [customer]);

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartAmount = cart.reduce(
    (sum, item) => sum + (item.product.price || 0) * item.quantity,
    0
  );

  return {
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
    showToast,
    addToCart,
    buyNow,
    addPartsToCart,
    updateQuantity,
    removeFromCart,
    handleAuthSuccess,
    logoutCustomer,
    handleOrderPlaced,
    openCheckout,
  };
}
