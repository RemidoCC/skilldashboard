import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { toCapacity, toLogEntry, toSkill, toTask } from './map';
import { addDays, dayKey, weekStart } from '@/lib/domain/dates';
import { balanceSignal } from '@/lib/domain/balance';
import { levelFraction } from '@/lib/domain/curve';
import { rustState, type RustState } from '@/lib/domain/rust';
import { statusLines } from '@/lib/domain/status';
import { streakDays } from '@/lib/domain/streak';
import { tierFor, totalLevel } from '@/lib/domain/tier';
import type { Capacity, LogEntry, Skill, Task } from '@/lib/domain/types';

/** How far back the streak walk needs to look. */
const HISTORY_DAYS = 90;

export interface MeterReading {
  skill: Skill;
  fraction: number;
  rust: RustState;
}

export interface VandaagData {
  today: string;
  capacity: Capacity;
  skills: Skill[];
  tasks: Task[];
  meters: MeterReading[];
  tier: ReturnType<typeof tierFor>;
  statusLines: string[];
  streakDays: number;
  xpToday: number;
  todayEntries: LogEntry[];
  seasonLabel: string | null;
}

/** Every query below is scoped by RLS to the signed-in user, so no id is passed. */
export async function loadVandaag(): Promise<VandaagData> {
  const supabase = await createClient();
  const today = dayKey(new Date());
  const since = addDays(today, -HISTORY_DAYS);

  const [skillsRes, tasksRes, entriesRes, weekRes, seasonRes] = await Promise.all([
    supabase.from('skills').select('*').order('sort_order'),
    supabase.from('tasks').select('*').eq('archived', false).order('created_at'),
    supabase
      .from('log_entries')
      .select('*')
      .gte('created_at', `${since}T00:00:00Z`)
      .order('created_at', { ascending: false }),
    supabase.from('week_settings').select('*').eq('week_start', weekStart(today)).maybeSingle(),
    supabase
      .from('seasons')
      .select('*')
      .lte('starts_on', today)
      .gte('ends_on', today)
      .maybeSingle(),
  ]);

  const failure = skillsRes.error ?? tasksRes.error ?? entriesRes.error;
  if (failure) {
    throw new Error(`Kon je gegevens niet laden: ${failure.message}`);
  }

  const skills = (skillsRes.data ?? []).map(toSkill);
  const tasks = (tasksRes.data ?? []).map(toTask);
  const entries = (entriesRes.data ?? []).map(toLogEntry);
  const capacity = toCapacity(weekRes.data?.capacity);

  const activeSkills = skills.filter((s) => s.active);
  const todayEntries = entries.filter((e) => dayKey(e.createdAt) === today);
  const xpToday = todayEntries.reduce((sum, e) => sum + e.xp, 0);

  const meters: MeterReading[] = activeSkills.map((skill) => ({
    skill,
    fraction: levelFraction(skill),
    rust: rustState(skill.lastActiveAt ? dayKey(skill.lastActiveAt) : null, today, capacity),
  }));

  // The status line reports the skill nearest to rusting, and prefers one that
  // has already started over one that is merely close.
  const nearest = [...meters]
    .filter((m) => m.skill.lastActiveAt !== null)
    .sort((a, b) => a.rust.daysUntilRust - b.rust.daysUntilRust || b.rust.daysInactive - a.rust.daysInactive)[0];

  const balance = balanceSignal(skills, entries, today);

  return {
    today,
    capacity,
    skills,
    tasks,
    meters,
    tier: tierFor(totalLevel(skills)),
    streakDays: streakDays(entries.map((e) => dayKey(e.createdAt)), today),
    xpToday,
    todayEntries,
    seasonLabel: seasonRes.data
      ? `${seasonRes.data.name} · ${seasonLabelFor(seasonRes.data.starts_on, today)}`
      : null,
    statusLines: statusLines({
      xpToday,
      balanceSentence: balance.sentence,
      quests: null, // Quests arrive in phase 4.
      rust: nearest
        ? {
            name: nearest.skill.name,
            daysInactive: nearest.rust.daysInactive,
            daysUntilRust: nearest.rust.daysUntilRust,
            status: nearest.rust.status,
          }
        : null,
    }),
  };
}

/** The week within a season, as W07. The season's own name supplies the S-part. */
function seasonLabelFor(startsOn: string, today: string): string {
  const [y, m, d] = startsOn.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const elapsed = Math.floor(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / (7 * 86_400_000),
  );
  const week = Math.min(Math.max(elapsed + 1, 1), 12);
  return `W${String(week).padStart(2, '0')}`;
}
