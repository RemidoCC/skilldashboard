'use client';

import { Display } from '@/components/instrument/Display';
import { useOptimisticSkills } from '@/lib/hooks/useOptimisticSkills';
import { pendingXpOn } from '@/lib/offline/optimistic';
import { nearestToRust, readMeters } from '@/lib/domain/meters';
import { statusLines } from '@/lib/domain/status';
import { tierFor, totalLevel } from '@/lib/domain/tier';
import type { Capacity, Skill } from '@/lib/domain/types';

interface Props {
  /** State as the server rendered it. Queued writes are folded on top. */
  skills: Skill[];
  today: string;
  capacity: Capacity;
  balanceSentence: string | null;
  serverXpToday: number;
  streakDays: number;
}

/**
 * The display, recomputed over whatever is still queued.
 *
 * Everything here runs the same domain functions the server ran, so a
 * completion made offline reads exactly as it will once it reaches the
 * database — no separate optimistic maths to drift apart.
 */
export function Instrument({
  skills,
  today,
  capacity,
  balanceSentence,
  serverXpToday,
  streakDays,
}: Props) {
  const { skills: optimistic, pending } = useOptimisticSkills(skills);
  const nearest = nearestToRust(readMeters(optimistic, today, capacity));

  const lines = statusLines({
    xpToday: serverXpToday + pendingXpOn(pending, today),
    balanceSentence,
    quests: null, // Quests arrive in phase 4.
    rust: nearest
      ? {
          name: nearest.skill.name,
          daysInactive: nearest.rust.daysInactive,
          daysUntilRust: nearest.rust.daysUntilRust,
          status: nearest.rust.status,
        }
      : null,
  });

  return (
    <div className="mt-3">
      <Display
        tier={tierFor(totalLevel(optimistic))}
        statusLines={lines}
        streakDays={streakDays}
      />
    </div>
  );
}
