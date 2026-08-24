'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/lib/hooks/usePrefersReducedMotion';

/**
 * The app's handshake. On open every needle sweeps to full and back while the
 * display lights every dot and fades to the real value. 600 ms, once per
 * session, and skipped entirely when the user prefers reduced motion.
 *
 * It lives in one place so the meters and the display move together — a device
 * powering up, not a set of independent animations.
 */
export type SelfTestPhase = 'idle' | 'sweep' | 'settle';

const SELF_TEST_KEY = 'skillunit.selftest';
const SWEEP_MS = 300;
const TOTAL_MS = 600;

const SelfTestContext = createContext<SelfTestPhase>('idle');

export function useSelfTest(): SelfTestPhase {
  return useContext(SelfTestContext);
}

export function SelfTestProvider({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<SelfTestPhase>('idle');

  useEffect(() => {
    if (reduced) return;

    let already = false;
    try {
      already = sessionStorage.getItem(SELF_TEST_KEY) === 'done';
    } catch {
      // Storage blocked: skip the test rather than replay it on every view.
      already = true;
    }
    if (already) return;

    try {
      sessionStorage.setItem(SELF_TEST_KEY, 'done');
    } catch {
      // Nothing to do.
    }

    setPhase('sweep');
    const toSettle = window.setTimeout(() => setPhase('settle'), SWEEP_MS);
    const toIdle = window.setTimeout(() => setPhase('idle'), TOTAL_MS);
    return () => {
      window.clearTimeout(toSettle);
      window.clearTimeout(toIdle);
    };
  }, [reduced]);

  return <SelfTestContext.Provider value={phase}>{children}</SelfTestContext.Provider>;
}
