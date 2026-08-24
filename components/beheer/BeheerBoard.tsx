'use client';

import { useMemo } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { applyMutations, type BeheerState } from '@/lib/offline/mutations';
import { TaskManager } from './TaskManager';
import { SkillManager } from './SkillManager';
import { GoalManager } from './GoalManager';
import { Settings } from './Settings';

/**
 * Beheer over the queue.
 *
 * Every edit here goes through the same outbox as a completion, so changing a
 * task on a train shows up straight away and reaches the database when the
 * signal comes back.
 */
export function BeheerBoard({ server, weekStart }: { server: BeheerState; weekStart: string }) {
  const { mutations } = useOffline();
  const state = useMemo(() => applyMutations(server, mutations), [server, mutations]);

  return (
    <div className="space-y-8">
      <TaskManager skills={state.skills} tasks={state.tasks} />
      <SkillManager skills={state.skills} />
      <GoalManager
        skills={state.skills}
        goals={state.goals}
        tasks={state.tasks}
        weekStart={weekStart}
      />

      <section aria-labelledby="koppelingen">
        <h2 id="koppelingen" className="label">
          Koppelingen
        </h2>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Agenda en mail worden in fase 5 aangesloten. Daarna staan hier de regels die bepalen welk
          item bij welke vaardigheid hoort.
        </p>
      </section>

      <Settings capacity={state.capacity} weekStart={weekStart} />
    </div>
  );
}
