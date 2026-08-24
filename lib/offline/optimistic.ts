import { applyXp } from '@/lib/domain/curve';
import { dayKey } from '@/lib/domain/dates';
import type { Skill } from '@/lib/domain/types';
import type { PendingCompletion } from './types';

/**
 * Folds queued writes onto the state the server rendered, so the meters and
 * the display move the moment something is recorded — online or not.
 *
 * The XP here is provisional: it was computed client-side from the streak the
 * page was rendered with. Once the queue drains, the server's authoritative
 * figure arrives with the next refresh and replaces it. That is the
 * last-write-wins rule, and the server always holds the last write.
 */
export function applyPending(
  skills: readonly Skill[],
  pending: readonly PendingCompletion[],
): Skill[] {
  if (pending.length === 0) return [...skills];

  const gains = new Map<string, number>();
  for (const item of pending) {
    gains.set(item.skillId, (gains.get(item.skillId) ?? 0) + item.xp);
  }

  return skills.map((skill) => {
    const gain = gains.get(skill.id);
    if (gain === undefined || gain === 0) return skill;

    const next = applyXp(
      { level: skill.level, xp: skill.xp, floorLevel: skill.floorLevel },
      gain,
    );
    return {
      ...skill,
      level: next.level,
      xp: next.xp,
      floorLevel: next.floorLevel,
      // Recording something is activity, so rust backs off straight away.
      lastActiveAt: mostRecent(skill.lastActiveAt, pending, skill.id),
    };
  });
}

function mostRecent(
  current: string | null,
  pending: readonly PendingCompletion[],
  skillId: string,
): string | null {
  let latest = current;
  for (const item of pending) {
    if (item.skillId !== skillId) continue;
    if (latest === null || item.occurredAt > latest) latest = item.occurredAt;
  }
  return latest;
}

/** Provisional XP from queued writes that belong to the given day. */
export function pendingXpOn(pending: readonly PendingCompletion[], day: string): number {
  return pending
    .filter((item) => dayKey(item.occurredAt) === day)
    .reduce((sum, item) => sum + item.xp, 0);
}
