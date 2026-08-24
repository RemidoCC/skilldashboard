import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { toLogEntry, toSkill } from './map';
import { addDays, dayKey } from '@/lib/domain/dates';
import { groupByDay, levelTrajectory, WINDOW_DAYS } from '@/lib/domain/trajectory';
import type { HistorieViewData } from '@/components/historie/HistorieView';

export interface HistorieData extends HistorieViewData {
  from: string;
  to: string;
}

export async function loadHistorie(): Promise<HistorieData> {
  const supabase = await createClient();
  const to = dayKey(new Date());
  const from = addDays(to, -(WINDOW_DAYS - 1));

  const [skillsRes, entriesRes, seasonsRes] = await Promise.all([
    supabase.from('skills').select('*').order('sort_order'),
    // The whole ledger: a level on day one of the window depends on all of it.
    supabase.from('log_entries').select('*').order('created_at'),
    supabase.from('seasons').select('*').order('starts_on', { ascending: false }),
  ]);

  const failure = skillsRes.error ?? entriesRes.error;
  if (failure) throw new Error(`Kon Historie niet laden: ${failure.message}`);

  const skills = (skillsRes.data ?? []).map(toSkill);
  const entries = (entriesRes.data ?? []).map(toLogEntry);
  const inWindow = entries.filter((e) => dayKey(e.createdAt) >= from);

  return {
    from,
    to,
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
