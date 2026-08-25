import { timerXp } from './xp';

/**
 * How an item from Google becomes a suggestion.
 *
 * Nothing here awards anything. It decides which skill an item probably
 * belongs to and what it would be worth; the tap that turns a suggestion into
 * XP happens on the Vandaag screen and nowhere else.
 */
export type IntegrationSource = 'calendar' | 'mail';

export interface MappingRule {
  id: string;
  source: IntegrationSource;
  /** Case-insensitive substring. Deliberately not a regular expression. */
  pattern: string;
  skillId: string;
  /** Calendar: XP per 10 minutes. Mail: XP for the day's batch. */
  xp: number;
}

/**
 * The first rule whose pattern appears in the text.
 *
 * First rather than best: the rules are an ordered list the user controls, so
 * a more specific rule placed above a general one wins, and the outcome is
 * something you can reason about by reading the list top to bottom.
 */
export function matchRule(
  text: string,
  rules: readonly MappingRule[],
  source: IntegrationSource,
): MappingRule | null {
  const haystack = text.toLowerCase();

  for (const rule of rules) {
    if (rule.source !== source) continue;
    const needle = rule.pattern.trim().toLowerCase();
    // An empty pattern would match everything, which is never what was meant.
    if (needle === '') continue;
    if (haystack.includes(needle)) return rule;
  }

  return null;
}

/** Whole minutes between two instants, floored at zero. */
export function eventMinutes(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(Math.round((end - start) / 60_000), 0);
}

/**
 * What a calendar event is worth.
 *
 * The rate is the skill's own timer value, so an hour in the diary is worth
 * exactly what an hour on the timer would have been. A skill with no timer
 * tasks falls back to the rule's own figure.
 */
export function calendarXp(minutes: number, timerValue: number): number {
  if (minutes <= 0) return 0;
  return timerXp(minutes, timerValue);
}

/**
 * The rate to use for a skill: the middle value of its timer tasks.
 *
 * Median rather than mean, so one unusually heavy task does not drag every
 * calendar suggestion up with it.
 */
export function timerRateFor(values: readonly number[], fallback: number): number {
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return fallback;
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The dedup key. An item that has already been seen must never come back as a
 * second suggestion, however often the sync runs.
 */
export function externalId(source: IntegrationSource, key: string): string {
  return `${source}:${key}`;
}

/** Sent mail is counted per rule per day, so one tap covers the batch. */
export function mailBatchId(ruleId: string, day: string): string {
  return externalId('mail', `${ruleId}:${day}`);
}

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export interface SuggestionDraft {
  externalId: string;
  source: IntegrationSource;
  title: string;
  skillId: string;
  xp: number;
  occurredAt: string;
}

/**
 * Turns past calendar events into suggestions.
 *
 * Only events that have already happened: a meeting still to come is not
 * effort spent, and offering it would let you bank work you have not done.
 */
export function suggestFromCalendar(
  events: readonly CalendarEvent[],
  rules: readonly MappingRule[],
  timerRates: ReadonlyMap<string, number>,
  now: Date,
): SuggestionDraft[] {
  const drafts: SuggestionDraft[] = [];

  for (const event of events) {
    if (Date.parse(event.endsAt) > now.getTime()) continue;

    const rule = matchRule(event.title, rules, 'calendar');
    if (!rule) continue;

    const minutes = eventMinutes(event.startsAt, event.endsAt);
    const xp = calendarXp(minutes, timerRates.get(rule.skillId) ?? rule.xp);
    if (xp <= 0) continue;

    drafts.push({
      externalId: externalId('calendar', event.id),
      source: 'calendar',
      title: `${event.title} · ${minutes} min`,
      skillId: rule.skillId,
      xp,
      occurredAt: event.endsAt,
    });
  }

  return drafts;
}

export interface SentMessage {
  id: string;
  /** Subject plus recipients: what a rule pattern is matched against. */
  text: string;
  sentAt: string;
}

/**
 * Turns sent mail into one suggestion per rule per day.
 *
 * A message at a time would bury the inbox under a working morning, so the
 * day's matches are counted and offered together — one tap for the batch.
 */
export function suggestFromMail(
  messages: readonly SentMessage[],
  rules: readonly MappingRule[],
  dayOf: (iso: string) => string,
): SuggestionDraft[] {
  const batches = new Map<string, { rule: MappingRule; day: string; count: number; last: string }>();

  for (const message of messages) {
    const rule = matchRule(message.text, rules, 'mail');
    if (!rule) continue;

    const day = dayOf(message.sentAt);
    const key = `${rule.id}:${day}`;
    const batch = batches.get(key);

    if (batch) {
      batch.count += 1;
      if (message.sentAt > batch.last) batch.last = message.sentAt;
    } else {
      batches.set(key, { rule, day, count: 1, last: message.sentAt });
    }
  }

  return [...batches.values()].map((batch) => ({
    externalId: mailBatchId(batch.rule.id, batch.day),
    source: 'mail' as const,
    title:
      batch.count === 1
        ? `1 verstuurde mail · ${batch.rule.pattern}`
        : `${batch.count} verstuurde mails · ${batch.rule.pattern}`,
    skillId: batch.rule.skillId,
    xp: batch.rule.xp,
    occurredAt: batch.last,
  }));
}
