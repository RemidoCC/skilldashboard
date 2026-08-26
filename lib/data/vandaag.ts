import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { toCapacity, toLogEntry, toSkill, toTask } from './map';
import { addDays, dayKey, weekStart } from '@/lib/domain/dates';
import { balanceSignal } from '@/lib/domain/balance';
import { buildWeekReport, type WeekReport } from '@/lib/domain/report';
import { isReportAvailable, reportKey } from '@/lib/domain/report-window';
import { levelTrajectory } from '@/lib/domain/trajectory';
import { nearestToRust, readMeters, type MeterReading } from '@/lib/domain/meters';
import { buildCandidates, generateQuests, type ProposedQuest } from '@/lib/domain/quests';
import { resolveStreak, type Freeze } from '@/lib/domain/freeze';
import { seasonLabel } from '@/lib/domain/season';
import { statusLines } from '@/lib/domain/status';
import { daysFromEntries } from '@/lib/domain/streak';
import { tierFor, totalLevel } from '@/lib/domain/tier';
import type { Capacity, LogEntry, Skill, Task } from '@/lib/domain/types';

/** How far back the streak walk needs to look. */
const HISTORY_DAYS = 90;

export interface QuestRow {
  id: string;
  skillId: string;
  title: string;
  target: number;
  progress: number;
  bonusXp: number;
  completed: boolean;
}

export interface GoalRow {
  id: string;
  skillId: string;
  title: string;
  progress: number;
}

export interface InboxRow {
  id: string;
  source: 'calendar' | 'mail';
  title: string;
  skillId: string | null;
  xp: number;
  occurredAt: string;
}

export interface VandaagData {
  today: string;
  capacity: Capacity;
  skills: Skill[];
  tasks: Task[];
  meters: MeterReading[];
  /** Kept so the client can rebuild the status line over queued writes. */
  balanceSentence: string | null;
  tier: ReturnType<typeof tierFor>;
  statusLines: string[];
  streakDays: number;
  xpToday: number;
  todayEntries: LogEntry[];
  seasonLabel: string | null;
  quests: QuestRow[];
  goals: GoalRow[];
  freezes: Freeze[];
  frozenDays: string[];
  /** Ranked candidates for next week, so the Sunday report can offer swaps. */
  questCandidates: ProposedQuest[];
  weekStart: string;
  nextWeekStart: string;
  /** Present only inside the window the report is on offer. */
  report: WeekReport | null;
  reportKey: string;
  /** The coming week's setting, which the Sunday report lets you pick. */
  nextCapacity: Capacity;
  /** Empty when Google is not connected, so the inbox simply does not appear. */
  inbox: InboxRow[];
}

/** Every query below is scoped by RLS to the signed-in user, so no id is passed. */
export async function loadVandaag(): Promise<VandaagData> {
  const supabase = await createClient();
  const today = dayKey(new Date());
  const since = addDays(today, -HISTORY_DAYS);

  const week = weekStart(today);
  const nextWeek = addDays(week, 7);

  const [
    skillsRes,
    tasksRes,
    entriesRes,
    weekRes,
    nextWeekRes,
    seasonRes,
    questsRes,
    goalsRes,
    freezeRes,
    inboxRes,
  ] = await Promise.all([
      supabase.from('skills').select('*').order('sort_order'),
      supabase.from('tasks').select('*').eq('archived', false).order('created_at'),
      supabase
        .from('log_entries')
        .select('*')
        .gte('created_at', `${since}T00:00:00Z`)
        .order('created_at', { ascending: false }),
      supabase.from('week_settings').select('*').eq('week_start', week).maybeSingle(),
      supabase.from('week_settings').select('*').eq('week_start', nextWeek).maybeSingle(),
      supabase
        .from('seasons')
        .select('*')
        .lte('starts_on', today)
        .gte('ends_on', today)
        .maybeSingle(),
      supabase.from('quests').select('*').eq('week_start', week),
      supabase.from('goals').select('*').eq('done', false),
      supabase.from('streak_freezes').select('*'),
      supabase
        .from('inbox_items')
        .select('*')
        .eq('status', 'pending')
        .order('occurred_at', { ascending: false }),
    ]);

  const failure = skillsRes.error ?? tasksRes.error ?? entriesRes.error;
  if (failure) {
    throw new Error(`Kon je gegevens niet laden: ${failure.message}`);
  }

  const skills = (skillsRes.data ?? []).map(toSkill);
  const tasks = (tasksRes.data ?? []).map(toTask);
  const entries = (entriesRes.data ?? []).map(toLogEntry);
  const capacity = toCapacity(weekRes.data?.capacity);

  const todayEntries = entries.filter((e) => dayKey(e.createdAt) === today);
  // Decay is not something you did today, so it stays out of the day's total.
  const xpToday = todayEntries
    .filter((e) => e.source !== 'rust')
    .reduce((sum, e) => sum + e.xp, 0);

  const meters: MeterReading[] = readMeters(skills, today, capacity);
  const nearest = nearestToRust(meters);
  const balance = balanceSignal(skills, entries, today);

  const quests: QuestRow[] = (questsRes.data ?? []).map((row) => ({
    id: row.id,
    skillId: row.skill_id,
    title: row.title,
    target: row.target,
    progress: row.progress,
    bonusXp: row.bonus_xp,
    completed: row.completed_at !== null,
  }));

  const goals: GoalRow[] = (goalsRes.data ?? []).map((row) => ({
    id: row.id,
    skillId: row.skill_id,
    title: row.title,
    progress: row.progress,
  }));

  const freezes: Freeze[] = (freezeRes.data ?? []).map((row) => ({
    id: row.id,
    earnedWeek: row.earned_week,
    spentOn: row.spent_on,
  }));

  const activityDays = daysFromEntries(entries);
  const streak = resolveStreak(activityDays, freezes, today);

  // Candidates for the coming week, ranked. The Sunday report shows the top
  // three and swaps down the list.
  const completionsBySkill = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.source === 'rust') continue;
    const list = completionsBySkill.get(entry.skillId);
    const day = dayKey(entry.createdAt);
    if (list) list.push(day);
    else completionsBySkill.set(entry.skillId, [day]);
  }
  const questCandidates = generateQuests(
    buildCandidates(
      skills.filter((s) => s.active),
      completionsBySkill,
      new Set(goals.map((g) => g.skillId)),
      today,
    ),
    capacity,
    nextWeek,
    // Every active skill, so a swap has somewhere to go.
    Number.MAX_SAFE_INTEGER,
  );

  // The report is computed when it is asked for rather than stored: it is
  // derived entirely from the ledger, so a live one can never be stale.
  const now = new Date();
  const showReport = isReportAvailable(now);
  let report: WeekReport | null = null;

  if (showReport) {
    const reportWeek = weekStart(today) === week ? week : week;
    const lines = levelTrajectory(
      skills.filter((s) => s.active),
      entries,
      addDays(reportWeek, -8),
      today,
    );
    const levelOn = (skillId: string, day: string): number => {
      const line = lines.find((l) => l.skillId === skillId);
      if (!line) return 1;
      const point = line.points.find((p) => p.day === day);
      return point?.level ?? line.from;
    };

    report = buildWeekReport({
      skills,
      entries,
      levelAt: levelOn,
      capacity,
      balanceSentence: balance.sentence,
      proposedQuests: questCandidates.slice(0, 3),
      today,
    });
  }

  const inbox: InboxRow[] = (inboxRes.data ?? []).map((row) => ({
    id: row.id,
    source: row.source === 'mail' ? 'mail' : 'calendar',
    title: row.title,
    skillId: row.suggested_skill_id,
    xp: row.suggested_xp,
    occurredAt: row.occurred_at,
  }));

  return {
    inbox,
    quests,
    goals,
    report,
    reportKey: reportKey(today),
    nextCapacity: toCapacity(nextWeekRes.data?.capacity),
    freezes,
    frozenDays: streak.frozenDays,
    questCandidates,
    weekStart: week,
    nextWeekStart: nextWeek,
    today,
    capacity,
    skills,
    tasks,
    meters,
    tier: tierFor(totalLevel(skills)),
    balanceSentence: balance.sentence,
    streakDays: streak.days,
    xpToday,
    todayEntries,
    seasonLabel: seasonRes.data
      ? seasonLabel(seasonRes.data.name, seasonRes.data.starts_on, today)
      : null,
    statusLines: statusLines({
      xpToday,
      balanceSentence: balance.sentence,
      quests: {
        total: quests.length,
        completed: quests.filter((q) => q.completed).length,
      },
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
