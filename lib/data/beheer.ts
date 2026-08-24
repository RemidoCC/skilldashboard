import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { toCapacity, toSkill, toTask } from './map';
import { dayKey, weekStart } from '@/lib/domain/dates';
import type { Capacity, Skill, Task } from '@/lib/domain/types';
import type { Goal } from '@/lib/offline/mutations';

export interface BeheerData {
  skills: Skill[];
  tasks: Task[];
  goals: Goal[];
  capacity: Capacity;
  weekStart: string;
}

/** RLS scopes every query to the signed-in user, so no id is passed. */
export async function loadBeheer(): Promise<BeheerData> {
  const supabase = await createClient();
  const week = weekStart(dayKey(new Date()));

  const [skillsRes, tasksRes, goalsRes, weekRes] = await Promise.all([
    supabase.from('skills').select('*').order('sort_order'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('goals').select('*').order('created_at'),
    supabase.from('week_settings').select('*').eq('week_start', week).maybeSingle(),
  ]);

  const failure = skillsRes.error ?? tasksRes.error ?? goalsRes.error;
  if (failure) throw new Error(`Kon Beheer niet laden: ${failure.message}`);

  return {
    skills: (skillsRes.data ?? []).map(toSkill),
    tasks: (tasksRes.data ?? []).map(toTask),
    goals: (goalsRes.data ?? []).map(
      (row): Goal => ({
        id: row.id,
        skillId: row.skill_id,
        title: row.title,
        targetDate: row.target_date,
        progress: row.progress,
        done: row.done,
      }),
    ),
    capacity: toCapacity(weekRes.data?.capacity),
    weekStart: week,
  };
}

/**
 * Everything the account holds, for the JSON export.
 *
 * The ledger is the point: with log_entries in hand, recalculate_levels can
 * rebuild every level from scratch, so this file is a real backup rather than
 * a snapshot of derived numbers.
 */
export async function loadExport(): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  const [skills, tasks, entries, goals, quests, seasons, weeks, freezes] = await Promise.all([
    supabase.from('skills').select('*').order('sort_order'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('log_entries').select('*').order('created_at'),
    supabase.from('goals').select('*').order('created_at'),
    supabase.from('quests').select('*').order('week_start'),
    supabase.from('seasons').select('*').order('starts_on'),
    supabase.from('week_settings').select('*').order('week_start'),
    supabase.from('streak_freezes').select('*').order('earned_week'),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    schema: 'skill-unit/1',
    skills: skills.data ?? [],
    tasks: tasks.data ?? [],
    logEntries: entries.data ?? [],
    goals: goals.data ?? [],
    quests: quests.data ?? [],
    seasons: seasons.data ?? [],
    weekSettings: weeks.data ?? [],
    streakFreezes: freezes.data ?? [],
  };
}
