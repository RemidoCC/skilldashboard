import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { accessTokenFor, fetchCalendarEvents, fetchSentMail, googleConfig } from './google';
import { dayKey } from '@/lib/domain/dates';
import {
  suggestFromCalendar,
  suggestFromMail,
  timerRateFor,
  type MappingRule,
  type SuggestionDraft,
} from '@/lib/domain/mapping';
import type { Database } from '@/lib/db/database.types';

type Admin = SupabaseClient<Database>;

export interface SyncReport {
  ran: 'sync';
  changes: string[];
}

/** Yesterday and today. Two runs a day, and neither looks further back. */
function window(now: Date): { from: Date; to: Date } {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  from.setUTCHours(0, 0, 0, 0);
  return { from, to: now };
}

/**
 * Pulls what happened and turns it into suggestions.
 *
 * Nothing here awards XP. Every draft lands in inbox_items as `pending` and
 * waits for a tap on Vandaag — that is the whole contract with the
 * integrations, and the reason a bad mapping rule can only ever waste a
 * moment rather than corrupt a history.
 */
export async function runSyncJob(origin: string): Promise<SyncReport> {
  const config = googleConfig(origin);
  if (!config) {
    return { ran: 'sync', changes: ['Google is niet ingesteld; niets opgehaald.'] };
  }

  const db = createAdminClient();
  const now = new Date();
  const { from, to } = window(now);
  const changes: string[] = [];

  const { data: accounts } = await db
    .from('integration_accounts')
    .select('*')
    .eq('provider', 'google');

  if ((accounts ?? []).length === 0) {
    return { ran: 'sync', changes: ['Geen gekoppeld account.'] };
  }

  for (const account of accounts ?? []) {
    const token = await accessTokenFor(config, account.refresh_token);
    if (typeof token !== 'string') {
      changes.push(`Toegang mislukte: ${token.error}`);
      continue;
    }

    const { data: ruleRows } = await db
      .from('mapping_rules')
      .select('*')
      .eq('user_id', account.user_id);

    const rules: MappingRule[] = (ruleRows ?? []).map((row) => ({
      id: row.id,
      source: row.source === 'mail' ? 'mail' : 'calendar',
      pattern: row.pattern,
      skillId: row.skill_id,
      xp: row.xp,
    }));

    if (rules.length === 0) {
      changes.push('Geen koppelregels, dus niets om op te matchen.');
      continue;
    }

    // A calendar event is priced at the skill's own timer rate.
    const { data: taskRows } = await db
      .from('tasks')
      .select('skill_id, value, kind, archived')
      .eq('user_id', account.user_id)
      .eq('kind', 'timer')
      .eq('archived', false);

    const valuesBySkill = new Map<string, number[]>();
    for (const row of taskRows ?? []) {
      const list = valuesBySkill.get(row.skill_id);
      if (list) list.push(row.value);
      else valuesBySkill.set(row.skill_id, [row.value]);
    }
    const timerRates = new Map(
      [...valuesBySkill.entries()].map(([skillId, values]) => [
        skillId,
        timerRateFor(values, 20),
      ]),
    );

    const drafts: SuggestionDraft[] = [];

    const events = await fetchCalendarEvents(token, from, to);
    if (Array.isArray(events)) {
      drafts.push(...suggestFromCalendar(events, rules, timerRates, now));
    } else {
      changes.push(events.error);
    }

    const messages = await fetchSentMail(token, from, to);
    if (Array.isArray(messages)) {
      drafts.push(...suggestFromMail(messages, rules, dayKey));
    } else {
      changes.push(messages.error);
    }

    if (drafts.length === 0) continue;
    changes.push(...(await storeDrafts(db, account.user_id, drafts)));
  }

  return { ran: 'sync', changes };
}

/**
 * Writes drafts as pending suggestions.
 *
 * Deduplicated on (user, external_id): a suggestion already offered — accepted,
 * dismissed, or still waiting — is never offered a second time, however often
 * the job runs.
 */
async function storeDrafts(
  db: Admin,
  userId: string,
  drafts: readonly SuggestionDraft[],
): Promise<string[]> {
  const { error, count } = await db
    .from('inbox_items')
    .upsert(
      drafts.map((draft) => ({
        user_id: userId,
        source: draft.source,
        external_id: draft.externalId,
        title: draft.title,
        suggested_skill_id: draft.skillId,
        suggested_xp: draft.xp,
        occurred_at: draft.occurredAt,
        status: 'pending',
      })),
      { onConflict: 'user_id,external_id', ignoreDuplicates: true, count: 'exact' },
    );

  if (error) return [`Voorstellen opslaan mislukte: ${error.message}`];
  return count && count > 0 ? [`${count} nieuwe voorstellen`] : [];
}
