'use client';

import { useMemo } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { applyPending } from '@/lib/offline/optimistic';
import type { Skill } from '@/lib/domain/types';
import type { PendingCompletion } from '@/lib/offline/types';

/**
 * Server state with the write queue folded on top.
 *
 * The display and the meters sit in different parts of the page but must agree
 * to the XP, so they share this rather than each folding the queue themselves.
 */
export function useOptimisticSkills(skills: Skill[]): {
  skills: Skill[];
  pending: PendingCompletion[];
} {
  const { pending } = useOffline();
  const optimistic = useMemo(() => applyPending(skills, pending), [skills, pending]);
  return { skills: optimistic, pending };
}
