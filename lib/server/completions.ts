import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { addDays, dayKey } from '@/lib/domain/dates';
import { daysFromEntries, streakDays } from '@/lib/domain/streak';
import { earnedXp, withStreakBonus } from '@/lib/domain/xp';
import { toKind } from '@/lib/data/map';
import type { Database } from '@/lib/db/database.types';

type Client = SupabaseClient<Database>;

export interface CompletionResult {
  ok: true;
  /** XP actually awarded, after the streak bonus. The client may have shown a
   *  provisional figure while offline; this is the authoritative one. */
  xp: number;
  level: number;
  leveledUp: boolean;
}
export interface CompletionFailure {
  ok: false;
  error: string;
  /** True when retrying could still work — a network or server problem rather
   *  than a bad request. The offline queue keeps these and drops the rest. */
  retryable: boolean;
}
export type CompletionOutcome = CompletionResult | CompletionFailure;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** One optional line. Never required, never blocks the action. */
function cleanNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  const trimmed = note.trim();
  return trimmed === '' ? null : trimmed.slice(0, 280);
}

/**
 * Postgres codes that mean "this write can never land", whatever we do.
 *
 * The queue keeps a 5xx and drops a 4xx, so calling everything retryable made
 * a permanent failure invisible: it never parked, never reported, and cycled
 * for as long as the app was open. A missing privilege or a violated
 * constraint will say the same thing on the thousandth attempt as on the
 * first. Anything not listed here still counts as worth retrying, because a
 * write that might yet succeed must not be thrown away.
 */
const PERMANENT_CODES = new Set([
  '42501', // insufficient_privilege, and the 'Niet ingelogd.' raise
  '42883', // undefined_function
  '42P01', // undefined_table
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23514', // check_violation
  '22023', // invalid_parameter_value — 'Onbekende vaardigheid.'
  '22P02', // invalid_text_representation
]);

function isRetryable(error: { code?: string | null }): boolean {
  return !(error.code && PERMANENT_CODES.has(error.code));
}

/** Streaks are worth XP, so the server works them out rather than trusting the client. */
async function currentStreak(supabase: Client, today: string): Promise<number> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('created_at, source')
    .gte('created_at', `${addDays(today, -60)}T00:00:00Z`);

  if (error || !data) return 0;
  return streakDays(
    daysFromEntries(data.map((row) => ({ createdAt: row.created_at, source: row.source }))),
    today,
  );
}

async function write(
  supabase: Client,
  args: {
    entryId: string;
    skillId: string;
    taskId: string | null;
    title: string;
    xp: number;
    minutes: number | null;
    note: string | null;
    source: 'manual' | 'timer' | 'quick';
    occurredAt: string;
  },
): Promise<CompletionOutcome> {
  const { data: before } = await supabase
    .from('skills')
    .select('level')
    .eq('id', args.skillId)
    .maybeSingle();

  const { data: after, error } = await supabase.rpc('log_completion', {
    p_id: args.entryId,
    p_skill: args.skillId,
    p_task: args.taskId,
    p_title: args.title,
    p_xp: args.xp,
    p_minutes: args.minutes,
    p_note: args.note,
    p_source: args.source,
    p_created_at: args.occurredAt,
  });

  if (error) {
    return {
      ok: false,
      error: `Opslaan mislukte: ${error.message}`,
      retryable: isRetryable(error),
    };
  }
  if (!after) {
    return {
      ok: false,
      error: 'Opslaan gaf geen bevestiging terug. Probeer opnieuw.',
      retryable: true,
    };
  }

  return {
    ok: true,
    xp: args.xp,
    level: after.level,
    leveledUp: after.level > (before?.level ?? after.level),
  };
}

export interface TaskCompletionInput {
  entryId: string;
  taskId: string;
  note?: string;
  minutes?: number;
  /** When the user actually did it. Matters for work queued offline. */
  occurredAt?: string;
}

export async function recordTaskCompletion(
  input: TaskCompletionInput,
): Promise<CompletionOutcome> {
  if (!isUuid(input.entryId) || !isUuid(input.taskId)) {
    return {
      ok: false,
      error: 'Ongeldige taak. Ververs de pagina en probeer opnieuw.',
      retryable: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Je sessie is verlopen. Log opnieuw in.', retryable: false };
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', input.taskId)
    .maybeSingle();

  if (taskError) {
    return { ok: false, error: `Kon de taak niet laden: ${taskError.message}`, retryable: true };
  }
  if (!task) {
    return { ok: false, error: 'Deze taak bestaat niet meer.', retryable: false };
  }

  const kind = toKind(task.kind);
  let minutes: number | null = null;

  if (kind === 'timer') {
    const raw = input.minutes;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
      return {
        ok: false,
        error: 'De timer leverde geen geldige tijd op. Start hem opnieuw.',
        retryable: false,
      };
    }
    minutes = Math.round(raw);
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  // The streak is judged on the day the work happened, which for a queued
  // mutation is not necessarily today.
  const streak = await currentStreak(supabase, dayKey(occurredAt));
  const xp =
    kind === 'timer'
      ? earnedXp({ kind: 'timer', value: task.value, minutes: minutes ?? 0 }, streak)
      : earnedXp({ kind: 'check', value: task.value }, streak);

  return write(supabase, {
    entryId: input.entryId,
    skillId: task.skill_id,
    taskId: task.id,
    title: task.title,
    xp,
    minutes,
    note: cleanNote(input.note),
    source: kind === 'timer' ? 'timer' : 'manual',
    occurredAt,
  });
}

export interface QuickLogInput {
  entryId: string;
  skillId: string;
  title: string;
  xp: number;
  note?: string;
  occurredAt?: string;
}

export async function recordQuickLog(input: QuickLogInput): Promise<CompletionOutcome> {
  if (!isUuid(input.entryId) || !isUuid(input.skillId)) {
    return { ok: false, error: 'Kies eerst een vaardigheid.', retryable: false };
  }

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title === '') {
    return { ok: false, error: 'Geef kort op wat je gedaan hebt.', retryable: false };
  }
  if (!Number.isFinite(input.xp) || input.xp < 5 || input.xp > 150) {
    return { ok: false, error: 'Kies een waarde tussen 5 en 150 XP.', retryable: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Je sessie is verlopen. Log opnieuw in.', retryable: false };
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const streak = await currentStreak(supabase, dayKey(occurredAt));

  return write(supabase, {
    entryId: input.entryId,
    skillId: input.skillId,
    taskId: null,
    title: title.slice(0, 120),
    xp: withStreakBonus(Math.round(input.xp), streak),
    minutes: null,
    note: cleanNote(input.note),
    source: 'quick',
    occurredAt,
  });
}
