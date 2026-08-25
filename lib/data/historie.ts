import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { toLogEntry, toSkill } from './map';
import { dayKey } from '@/lib/domain/dates';
import {
  groupByDay,
  levelTrajectory,
  windowStart,
  type HistoryRange,
} from '@/lib/domain/trajectory';
import type { HistorieViewData } from '@/components/historie/HistorieView';

export interface HistorieData extends HistorieViewData {
  from: string;
  to: string;
}

export async function loadHistorie(range: HistoryRange): Promise<HistorieData> {
  const supabase = await createClient();
  const to = dayKey(new Date());

  const [skillsRes, entriesRes, seasonsRes] = await Promise.all([
    supabase.from('skills').select('*').order('sort_order'),
    // The whole ledger: a level on day one of the window depends on all of it,
    // whatever the window is.
    supabase.from('log_entries').select('*').order('created_at'),
    supabase.from('seasons').select('*').order('starts_on', { ascending: false }),
  ]);

  const failure = skillsRes.error ?? entriesRes.error;
  if (failure) throw new Error(`Kon Historie niet laden: ${failure.message}`);

  const skills = (skillsRes.data ?? []).map(toSkill);
  const entries = (entriesRes.data ?? []).map(toLogEntry);
  // Ordered by created_at, so the first entry is the oldest thing that happened.
  const earliest = entries.length > 0 ? dayKey(entries[0].createdAt) : null;
  const from = windowStart(range, to, earliest);
  const inWindow = entries.filter((e) => dayKey(e.createdAt) >= from);

  return {
    from,
    to,
    range,
    trajectories: levelTrajectory(
      skills.filter((s) => s.active),
      entries,
      from,
      to,
    ),
    days: groupByDay(inWindow),
    skillNames: new Map(skills.map((s) => [s.id, s.name])),
    seasons: seasonsRes.data ?? [],
  };
}
