import { useState, useEffect } from 'react';

export function usePersistentStorage() {
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAndRequestPersistence() {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        const persisted = await navigator.storage.persisted();
        if (!persisted) {
          const granted = await navigator.storage.persist();
          setIsPersisted(granted);
        } else {
          setIsPersisted(true);
        }
      } else {
        setIsPersisted(false);
      }
    }

    checkAndRequestPersistence().catch(() => setIsPersisted(false));
  }, []);

  return isPersisted;
}
