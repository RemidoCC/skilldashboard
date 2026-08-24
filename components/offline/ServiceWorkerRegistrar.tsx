'use client';

import { useEffect } from 'react';

/**
 * Registers the worker once the page is quiet, so it never competes with the
 * first render for bandwidth.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Blocked, unsupported, or running from a context that forbids it.
        // The app works without it; only offline navigation is lost.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
