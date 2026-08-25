import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { toCapacity, toSkill, toTask } from './map';
import { dayKey, weekStart } from '@/lib/domain/dates';
import { isGoogleConfigured } from '@/lib/server/google';
import type { Capacity, Skill, Task } from '@/lib/domain/types';
import type { Goal, MappingRuleRow } from '@/lib/offline/mutations';

export interface BeheerData {
  skills: Skill[];
  tasks: Task[];
  goals: Goal[];
  rules: MappingRuleRow[];
  capacity: Capacity;
  weekStart: string;
  /** Whether the OAuth credentials exist at all, and whether an account is linked. */
  googleConfigured: boolean;
  googleConnected: boolean;
}

/** RLS scopes every query to the signed-in user, so no id is passed. */
export async function loadBeheer(): Promise<BeheerData> {
  const supabase = await createClient();
  const week = weekStart(dayKey(new Date()));

  const [skillsRes, tasksRes, goalsRes, weekRes, rulesRes, accountRes] = await Promise.all([
    supabase.from('skills').select('*').order('sort_order'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('goals').select('*').order('created_at'),
    supabase.from('week_settings').select('*').eq('week_start', week).maybeSingle(),
    supabase.from('mapping_rules').select('*'),
    // The refresh token is unreadable under RLS, so this only ever answers
    // "is something linked" — which is all the screen needs to know.
    supabase.from('integration_accounts').select('provider').eq('provider', 'google').maybeSingle(),
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
    rules: (rulesRes.data ?? []).map(
      (row): MappingRuleRow => ({
        id: row.id,
        source: row.source === 'mail' ? 'mail' : 'calendar',
        pattern: row.pattern,
        skillId: row.skill_id,
        xp: row.xp,
      }),
    ),
    capacity: toCapacity(weekRes.data?.capacity),
    weekStart: week,
    googleConfigured: isGoogleConfigured(),
    googleConnected: Boolean(accountRes.data),
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
