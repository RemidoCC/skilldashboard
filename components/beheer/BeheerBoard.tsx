'use client';

import { useMemo } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { applyMutations, type BeheerState } from '@/lib/offline/mutations';
import { TaskManager } from './TaskManager';
import { SkillManager } from './SkillManager';
import { GoalManager } from './GoalManager';
import { MappingRules } from './MappingRules';
import { Settings } from './Settings';

/**
 * Beheer over the queue.
 *
 * Every edit here goes through the same outbox as a completion, so changing a
 * task on a train shows up straight away and reaches the database when the
 * signal comes back.
 */
export function BeheerBoard({
  server,
  weekStart,
  googleConfigured,
  googleConnected,
}: {
  server: BeheerState;
  weekStart: string;
  googleConfigured: boolean;
  googleConnected: boolean;
}) {
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

      <MappingRules
        rules={state.rules}
        skills={state.skills}
        connected={googleConnected}
        configured={googleConfigured}
      />

      <Settings capacity={state.capacity} weekStart={weekStart} />
    </div>
  );
}
