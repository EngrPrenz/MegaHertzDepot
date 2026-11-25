import { useState, useEffect, useCallback } from 'react';

export type ColorSchemePreference = 'system' | 'light' | 'dark';
export type ResolvedColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'color-scheme';
const CHANGE_EVENT = 'mhd-color-scheme-change';

function readStoredPreference(): ColorSchemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const val = window.localStorage.getItem(STORAGE_KEY);
    if (val === 'light' || val === 'dark') return val;
  } catch {
    // Ignore storage access errors (e.g., restricted browsing contexts)
  }
  return 'system';
}

function getSystemScheme(): ResolvedColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncMetaTag(pref: ColorSchemePreference): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = pref === 'system' ? 'light dark' : pref;
  }
}

/**
 * Computes the next persisted color-scheme preference for a 2-state UI toggle.
 * Switches to the opposite of the currently rendered scheme; if that matches
 * the OS preference, clears the explicit override back to 'system'.
 */
export function computeNextColorSchemeOverride(
  preference: ColorSchemePreference,
  systemScheme: ResolvedColorScheme
): ColorSchemePreference {
  const rendered: ResolvedColorScheme = preference === 'system' ? systemScheme : preference;
  const target: ResolvedColorScheme = rendered === 'dark' ? 'light' : 'dark';
  return target === systemScheme ? 'system' : target;
}

export function useColorScheme() {
  const [preference, setPreferenceState] = useState<ColorSchemePreference>(readStoredPreference);
  const [systemScheme, setSystemScheme] = useState<ResolvedColorScheme>(getSystemScheme);

  const applyPreference = useCallback((next: ColorSchemePreference) => {
    setPreferenceState(next);
    syncMetaTag(next);
    if (typeof window !== 'undefined') {
      try {
        if (next === 'system') {
          window.localStorage.removeItem(STORAGE_KEY);
        } else {
          window.localStorage.setItem(STORAGE_KEY, next);
        }
      } catch {
        // Ignore storage write failure; in-memory meta remains updated
      }
      window.dispatchEvent(new CustomEvent<ColorSchemePreference>(CHANGE_EVENT, { detail: next }));
    }
  }, []);

  useEffect(() => {
    syncMetaTag(preference);
  }, [preference]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const onMediaChange = (e: MediaQueryListEvent) => {
      // Update resolved OS preference only; never erase a pinned user override
      setSystemScheme(e.matches ? 'dark' : 'light');
    };

    const onStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        const synced = readStoredPreference();
        setPreferenceState(synced);
        syncMetaTag(synced);
      }
    };

    const onSameTabChange = (e: Event) => {
      const detail = (e as CustomEvent<ColorSchemePreference>).detail;
      if (detail === 'system' || detail === 'light' || detail === 'dark') {
        setPreferenceState(detail);
        syncMetaTag(detail);
      }
    };

    mq?.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorageChange);
    window.addEventListener(CHANGE_EVENT, onSameTabChange);

    return () => {
      mq?.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorageChange);
      window.removeEventListener(CHANGE_EVENT, onSameTabChange);
    };
  }, []);

  const resolvedScheme: ResolvedColorScheme =
    preference === 'system' ? systemScheme : preference;

  const toggle = useCallback(() => {
    const next = computeNextColorSchemeOverride(preference, systemScheme);
    applyPreference(next);
  }, [preference, systemScheme, applyPreference]);

  return {
    preference,
    systemScheme,
    resolvedScheme,
    setPreference: applyPreference,
    toggle,
  };
}
