'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  enqueue,
  flush,
  pending as readPending,
  readFailures,
  requestBackgroundSync,
  dismissFailure as forgetFailure,
} from '@/lib/offline/queue';
import { SYNC_CHANNEL, type FailedCompletion, type PendingCompletion } from '@/lib/offline/types';

/** Everything a caller supplies; the queue adds the retry count. */
export type RecordInput = Omit<PendingCompletion, 'attempts'>;

interface OfflineState {
  pending: PendingCompletion[];
  online: boolean;
  syncing: boolean;
  /** Writes that can never succeed, surfaced once so they are not lost silently. */
  failures: FailedCompletion[];
  record: (input: RecordInput) => Promise<void>;
  dismissFailure: (id: string) => void;
}

const OfflineContext = createContext<OfflineState | null>(null);

export function useOffline(): OfflineState {
  const state = useContext(OfflineContext);
  if (!state) throw new Error('useOffline must be used inside OfflineProvider');
  return state;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingCompletion[]>([]);
  // Assume online for the first paint so the server and client markup agree;
  // the effect corrects it immediately.
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [failures, setFailures] = useState<FailedCompletion[]>([]);

  const refreshPending = useCallback(async () => {
    setPending(await readPending());
  }, []);

  /* Failures are parked in IndexedDB rather than passed around, because the
     worker usually drains the queue with no page open to hear a message.
     The store stays the truth until the user dismisses one, so reading is
     safe to repeat. */
  const collectFailures = useCallback(async () => {
    setFailures(await readFailures());
  }, []);

  const drain = useCallback(async () => {
    setSyncing(true);
    try {
      const report = await flush();
      await collectFailures();
      await refreshPending();
      // Anything that landed changes levels and XP, so pull fresh server state.
      if (report.sent > 0) router.refresh();
    } finally {
      setSyncing(false);
    }
  }, [collectFailures, refreshPending, router]);

  // Pick up anything left over from a previous session, and keep the local
  // view of the queue honest.
  useEffect(() => {
    setOnline(navigator.onLine);
    void (async () => {
      // Anything the worker parked while the app was shut.
      await collectFailures();
      await refreshPending();
      if (navigator.onLine) await drain();
    })();
  }, [collectFailures, drain, refreshPending]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void drain();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void drain();
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [drain]);

  // The worker drains the queue too, in the background. When it does, the page
  // needs to catch up rather than keep showing stale pending rows.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channel.onmessage = (event: MessageEvent<{ type?: string; sent?: number }>) => {
      if (event.data?.type !== 'drained') return;
      void collectFailures();
      void refreshPending();
      if ((event.data.sent ?? 0) > 0) router.refresh();
    };
    return () => channel.close();
  }, [collectFailures, refreshPending, router]);

  const record = useCallback(
    async (input: RecordInput) => {
      const item: PendingCompletion = { ...input, attempts: 0 };
      // Show it first. The UI must never wait on the network.
      setPending((current) => [...current, item]);
      await enqueue(item);
      void requestBackgroundSync();
      if (navigator.onLine) await drain();
    },
    [drain],
  );

  const dismissFailure = useCallback((id: string) => {
    setFailures((current) => current.filter((failure) => failure.id !== id));
    void forgetFailure(id);
  }, []);

  return (
    <OfflineContext.Provider
      value={{ pending, online, syncing, failures, record, dismissFailure }}
    >
      {children}
    </OfflineContext.Provider>
  );
}
