import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { toCapacity, toSkill, toTask } from './map';
import { dayKey, weekStart } from '@/lib/domain/dates';
import { isGoogleConfigured } from '@/lib/server/google';
import { isEncryptionConfigured } from '@/lib/server/secrets';
import { SCHEMA_VERSION, TABLES } from '@/lib/domain/restore';
import type { Database } from '@/lib/db/database.types';
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
  /** Whether a token could be stored safely at all. Without it, no connecting. */
  googleKeyed: boolean;
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
    googleKeyed: isEncryptionConfigured(),
  };
}

/**
 * Everything the account holds, for the JSON export.
 *
 * Driven by the same table list the importer reads, and selecting exactly the
 * columns it will accept. That is what keeps a backup restorable: a column
 * added to one side and forgotten on the other cannot happen, because there is
 * only one side.
 *
 * The ledger is the point. With log_entries in hand recalculate_levels rebuilds
 * every level from scratch, so this file is a real backup rather than a
 * snapshot of derived numbers. `user_id` is not in it: a restore takes its
 * owner from whoever is signed in.
 */
export async function loadExport(): Promise<Record<string, unknown>> {
  const supabase = await createClient();

  const results = await Promise.all(
    TABLES.map((spec) =>
      supabase
        // The spec is deliberately free of database types so the domain layer
        // stays dependency-free; this is the one place it has to be narrowed.
        .from(spec.table as keyof Database['public']['Tables'])
        .select(Object.keys(spec.columns).join(','))
        .order(spec.orderBy),
    ),
  );

  const failure = results.find((r) => r.error)?.error;
  if (failure) throw new Error(`Kon de export niet maken: ${failure.message}`);

  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    schema: SCHEMA_VERSION,
  };
  for (const [index, spec] of TABLES.entries()) payload[spec.key] = results[index].data ?? [];

  return payload;
}
