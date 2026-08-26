import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCapacity, toLogEntry, toSkill } from '@/lib/data/map';
import { dayKey, weekStart } from '@/lib/domain/dates';
import { rustXpDelta, shouldRust } from '@/lib/domain/rust';
import { freezeToGrant, freezeToSpend, type Freeze } from '@/lib/domain/freeze';
import { daysFromEntries, longestRun } from '@/lib/domain/streak';
import { buildCandidates, generateQuests } from '@/lib/domain/quests';
import {
  badgeSlug,
  badgeTheme,
  hasEnded,
  nextSeason,
  seasonEnd,
  seasonName,
  seasonStartFor,
  seasonSummary,
  type SeasonTally,
} from '@/lib/domain/season';
import { levelTrajectory, recoveredWithin } from '@/lib/domain/trajectory';
import type { Database, Json } from '@/lib/db/database.types';
import type { Capacity, LogEntry, Skill } from '@/lib/domain/types';

type Admin = SupabaseClient<Database>;

export interface JobReport {
  ran: string;
  /** One line per thing that actually changed. Silence means nothing did. */
  changes: string[];
}

/** Everything a job needs about one account, read once. */
interface Account {
  userId: string;
  skills: Skill[];
  entries: LogEntry[];
  capacity: Capacity;
  today: string;
}

async function loadAccount(db: Admin, userId: string, today: string): Promise<Account> {
  const [skillsRes, entriesRes, weekRes] = await Promise.all([
    db.from('skills').select('*').eq('user_id', userId).order('sort_order'),
    db.from('log_entries').select('*').eq('user_id', userId).order('created_at'),
    db
      .from('week_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('week_start', weekStart(today))
      .maybeSingle(),
  ]);

  return {
    userId,
    skills: (skillsRes.data ?? []).map(toSkill),
    entries: (entriesRes.data ?? []).map(toLogEntry),
    capacity: toCapacity(weekRes.data?.capacity),
    today,
  };
}

/** Every account the jobs should run for. One, in practice. */
async function accountIds(db: Admin): Promise<string[]> {
  const { data } = await db.from('skills').select('user_id');
  return [...new Set((data ?? []).map((row) => row.user_id))];
}

/* ------------------------------------------------------------------ rust -- */

/**
 * Applies decay to skills that have gone past their grace period.
 *
 * Rust costs one level per episode, not one level a day: a skill that has
 * already rusted since it was last used is left alone until it is used again.
 * Without that check a fortnight away would quietly cost a fortnight of
 * levels, which is exactly the punishment the rule is written to avoid.
 */
export async function runRust(db: Admin, account: Account): Promise<string[]> {
  const changes: string[] = [];

  for (const skill of account.skills) {
    if (!shouldRust(skill, account.entries, account.today, account.capacity)) continue;

    const delta = rustXpDelta({ level: skill.level, xp: skill.xp, floorLevel: skill.floorLevel });

    const { error } = await db.rpc('log_completion', {
      p_id: crypto.randomUUID(),
      p_skill: skill.id,
      p_task: null,
      p_title: `${skill.name} roestte een niveau`,
      p_xp: delta,
      p_minutes: null,
      p_note: null,
      p_source: 'rust',
      p_created_at: new Date().toISOString(),
      // A cron run holds the service role, which carries no `sub` claim, so
      // auth.uid() inside the function is null. Without naming the account
      // here the call is refused with 'Niet ingelogd.' and decay silently
      // never happens.
      p_user: account.userId,
    });

    if (error) {
      changes.push(`${skill.name}: roest mislukte (${error.message})`);
      continue;
    }

    changes.push(`${skill.name} roestte naar niveau ${skill.level - 1}`);
  }

  return changes;
}

/* --------------------------------------------------------------- freezes -- */

async function loadFreezes(db: Admin, userId: string): Promise<Freeze[]> {
  const { data } = await db.from('streak_freezes').select('*').eq('user_id', userId);
  return (data ?? []).map((row) => ({
    id: row.id,
    earnedWeek: row.earned_week,
    spentOn: row.spent_on,
  }));
}

/**
 * Spends a freeze on a day that would otherwise have broken the streak, and
 * grants one for a completed week.
 */
export async function runFreezes(db: Admin, account: Account): Promise<string[]> {
  const changes: string[] = [];
  const freezes = await loadFreezes(db, account.userId);
  const days = daysFromEntries(account.entries);

  const earned = freezeToGrant(days, freezes, weekStart(account.today));
  if (earned !== null) {
    // Ask for the row back rather than only whether it landed. Without the real
    // id the freeze could not be spent in the same run, and the run that grants
    // one is exactly the run that tends to need it: a week worked through,
    // Sunday missed, the job firing on Monday. It fell through to "no freeze
    // held" and the streak broke with one sitting unused.
    const { data, error } = await db
      .from('streak_freezes')
      .insert({ user_id: account.userId, earned_week: earned })
      .select('id')
      .single();
    if (!error && data) {
      changes.push(`Freeze verdiend voor de week van ${earned}`);
      freezes.push({ id: data.id, earnedWeek: earned, spentOn: null });
    }
  }

  const due = freezeToSpend(days, freezes, account.today);
  if (due !== null) {
    const held = freezes.find((f) => f.spentOn === null);
    if (held) {
      const { error } = await db
        .from('streak_freezes')
        .update({ spent_on: due })
        .eq('id', held.id);
      if (!error) changes.push(`Freeze ingezet voor ${due}`);
    }
  }

  return changes;
}

/* ---------------------------------------------------------------- quests -- */

/**
 * Puts three quests on the current week, once.
 *
 * Idempotent by week: a job that runs twice, or a Monday that fires after the
 * user already accepted a set from the Sunday report, changes nothing.
 */
export async function runQuests(db: Admin, account: Account): Promise<string[]> {
  const week = weekStart(account.today);

  const { data: existing } = await db
    .from('quests')
    .select('id')
    .eq('user_id', account.userId)
    .eq('week_start', week);
  if ((existing ?? []).length > 0) return [];

  const { data: goalRows } = await db
    .from('goals')
    .select('skill_id')
    .eq('user_id', account.userId)
    .eq('done', false);
  const goalSkills = new Set((goalRows ?? []).map((row) => row.skill_id));

  const bySkill = new Map<string, string[]>();
  for (const entry of account.entries) {
    if (entry.source === 'rust') continue;
    const list = bySkill.get(entry.skillId);
    const day = dayKey(entry.createdAt);
    if (list) list.push(day);
    else bySkill.set(entry.skillId, [day]);
  }

  const candidates = buildCandidates(
    account.skills.filter((s) => s.active),
    bySkill,
    goalSkills,
    account.today,
  );
  const quests = generateQuests(candidates, account.capacity, week);
  if (quests.length === 0) return [];

  const { error } = await db.from('quests').insert(
    quests.map((quest) => ({
      user_id: account.userId,
      skill_id: quest.skillId,
      title: quest.title,
      target: quest.target,
      bonus_xp: quest.bonusXp,
      week_start: quest.weekStart,
    })),
  );

  return error ? [`Opdrachten zetten mislukte: ${error.message}`] : [`${quests.length} opdrachten gezet voor ${week}`];
}

/* --------------------------------------------------------------- seasons -- */

/** Opens the first season, and rolls one over when its twelve weeks are up. */
export async function runSeasons(db: Admin, account: Account): Promise<string[]> {
  const { data: rows } = await db
    .from('seasons')
    .select('*')
    .eq('user_id', account.userId)
    .order('starts_on', { ascending: false });

  const latest = (rows ?? [])[0];

  if (!latest) {
    const startsOn = seasonStartFor(account.today);
    const { error } = await db.from('seasons').insert({
      user_id: account.userId,
      name: seasonName(1),
      starts_on: startsOn,
      ends_on: seasonEnd(startsOn),
      badge_slug: '',
    });
    return error ? [`Seizoen openen mislukte: ${error.message}`] : [`Seizoen S01 geopend`];
  }

  if (!hasEnded({ endsOn: latest.ends_on }, account.today)) return [];
  // Already closed and badged.
  if (latest.badge_slug !== '') {
    const next = nextSeason({ name: latest.name, endsOn: latest.ends_on });
    const { data: exists } = await db
      .from('seasons')
      .select('id')
      .eq('user_id', account.userId)
      .eq('starts_on', next.startsOn)
      .maybeSingle();
    if (exists) return [];

    const { error } = await db.from('seasons').insert({
      user_id: account.userId,
      name: next.name,
      starts_on: next.startsOn,
      ends_on: next.endsOn,
      badge_slug: '',
    });
    return error ? [`Volgend seizoen openen mislukte: ${error.message}`] : [`Seizoen ${next.name} geopend`];
  }

  const changes = await closeSeason(db, account, latest);
  return changes;
}

async function closeSeason(
  db: Admin,
  account: Account,
  season: { id: string; name: string; starts_on: string; ends_on: string },
): Promise<string[]> {
  const active = account.skills.filter((s) => s.active);
  const trajectories = levelTrajectory(active, account.entries, season.starts_on, season.ends_on);

  const tallies: SeasonTally[] = active.map((skill) => {
    const line = trajectories.find((t) => t.skillId === skill.id);
    const xp = account.entries
      .filter((e) => {
        const day = dayKey(e.createdAt);
        return e.skillId === skill.id && day >= season.starts_on && day <= season.ends_on;
      })
      .reduce((sum, e) => sum + e.xp, 0);

    return {
      skillId: skill.id,
      name: skill.name,
      xp,
      levelsGained: Math.max((line?.to ?? 1) - (line?.from ?? 1), 0),
      // Dipped below its peak inside the season and climbed back out. The test
      // lives in the domain because getting it wrong here is invisible: it
      // does not throw, it just hands every season the same badge.
      recovered: line ? recoveredWithin(line) : false,
    };
  });

  const { count } = await db
    .from('quests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', account.userId)
    .gte('week_start', season.starts_on)
    .lte('week_start', season.ends_on)
    .not('completed_at', 'is', null);

  // The longest run the season actually held, counting days a freeze carried,
  // so the summary agrees with what Vandaag showed at the time. This used to
  // be passed as a literal zero, which reported a fact nobody had measured.
  const freezes = await loadFreezes(db, account.userId);
  const longest = longestRun(
    daysFromEntries(account.entries),
    freezes.map((f) => f.spentOn).filter((d): d is string => d !== null),
    season.starts_on,
    season.ends_on,
  );

  const theme = badgeTheme(tallies);
  const summary = seasonSummary(tallies, count ?? 0, longest);

  const { error } = await db
    .from('seasons')
    // The summary is a plain record; jsonb takes it as-is.
    .update({
      badge_slug: badgeSlug(season.name, theme),
      summary: JSON.parse(JSON.stringify(summary)) as Json,
    })
    .eq('id', season.id);

  if (error) return [`Seizoen afsluiten mislukte: ${error.message}`];
  return [`Seizoen ${season.name} afgesloten als ${theme}`];
}

/* ----------------------------------------------------------------- entry -- */

export async function runDailyJob(): Promise<JobReport> {
  const db = createAdminClient();
  const today = dayKey(new Date());
  const changes: string[] = [];

  for (const userId of await accountIds(db)) {
    const account = await loadAccount(db, userId, today);
    changes.push(...(await runRust(db, account)));
    changes.push(...(await runFreezes(db, account)));
  }

  return { ran: 'daily', changes };
}

export async function runWeeklyJob(): Promise<JobReport> {
  const db = createAdminClient();
  const today = dayKey(new Date());
  const changes: string[] = [];

  for (const userId of await accountIds(db)) {
    const account = await loadAccount(db, userId, today);
    // Seasons first: a rollover decides which week the quests belong to.
    changes.push(...(await runSeasons(db, account)));
    changes.push(...(await runQuests(db, account)));
  }

  return { ran: 'weekly', changes };
}
