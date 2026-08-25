import { describe, expect, it } from 'vitest';
import {
  calendarXp,
  eventMinutes,
  externalId,
  mailBatchId,
  matchRule,
  suggestFromCalendar,
  suggestFromMail,
  timerRateFor,
  type CalendarEvent,
  type MappingRule,
  type SentMessage,
} from '@/lib/domain/mapping';
import { dayKey } from '@/lib/domain/dates';

const WERK = '11111111-1111-4111-8111-111111111111';
const GEZIN = '22222222-2222-4222-8222-222222222222';

function rule(over: Partial<MappingRule> & { pattern: string }): MappingRule {
  return { id: `r-${over.pattern}`, source: 'calendar', skillId: WERK, xp: 20, ...over };
}

describe('matchRule', () => {
  const rules = [rule({ pattern: 'standup' }), rule({ pattern: 'klant', skillId: GEZIN })];

  it('matches a substring, ignoring case', () => {
    expect(matchRule('Dagelijkse Standup', rules, 'calendar')?.pattern).toBe('standup');
  });

  it('returns null when nothing matches', () => {
    expect(matchRule('Lunch', rules, 'calendar')).toBeNull();
  });

  it('only considers rules for the same source', () => {
    expect(matchRule('standup', rules, 'mail')).toBeNull();
  });

  it('takes the first match, so a specific rule above a general one wins', () => {
    const ordered = [rule({ pattern: 'klant acme', skillId: GEZIN }), rule({ pattern: 'klant' })];
    expect(matchRule('Overleg klant Acme', ordered, 'calendar')?.skillId).toBe(GEZIN);
  });

  it('ignores an empty pattern rather than matching everything', () => {
    expect(matchRule('wat dan ook', [rule({ pattern: '   ' })], 'calendar')).toBeNull();
  });

  it('trims a pattern with stray spaces', () => {
    expect(matchRule('Standup', [rule({ pattern: '  standup  ' })], 'calendar')).not.toBeNull();
  });
});

describe('eventMinutes', () => {
  it('counts whole minutes', () => {
    expect(eventMinutes('2026-08-24T09:00:00Z', '2026-08-24T10:30:00Z')).toBe(90);
  });

  it('is zero for an event that ends before it starts', () => {
    expect(eventMinutes('2026-08-24T10:00:00Z', '2026-08-24T09:00:00Z')).toBe(0);
  });

  it('is zero for unparseable times rather than NaN', () => {
    expect(eventMinutes('niet een datum', '2026-08-24T10:00:00Z')).toBe(0);
  });
});

describe('calendarXp', () => {
  it('is the timer rate applied to the duration', () => {
    // 60 minutes at 20 XP per 10 minutes.
    expect(calendarXp(60, 20)).toBe(120);
  });

  it('is nothing for a zero-length event', () => {
    expect(calendarXp(0, 20)).toBe(0);
  });

  it('follows the same short-session floor as a real timer', () => {
    expect(calendarXp(1, 4)).toBe(4);
  });
});

describe('timerRateFor', () => {
  it('takes the middle value', () => {
    expect(timerRateFor([10, 20, 90], 5)).toBe(20);
  });

  it('is not dragged up by one heavy task', () => {
    expect(timerRateFor([10, 10, 10, 150], 5)).toBe(10);
  });

  it('falls back when the skill has no timer tasks', () => {
    expect(timerRateFor([], 25)).toBe(25);
    expect(timerRateFor([0, -5], 25)).toBe(25);
  });
});

describe('externalId', () => {
  it('namespaces by source so a shared id cannot collide', () => {
    expect(externalId('calendar', 'abc')).toBe('calendar:abc');
    expect(externalId('mail', 'abc')).toBe('mail:abc');
    expect(externalId('calendar', 'abc')).not.toBe(externalId('mail', 'abc'));
  });

  it('gives a mail batch one id per rule per day', () => {
    expect(mailBatchId('r1', '2026-08-24')).toBe('mail:r1:2026-08-24');
    expect(mailBatchId('r1', '2026-08-24')).toBe(mailBatchId('r1', '2026-08-24'));
    expect(mailBatchId('r1', '2026-08-24')).not.toBe(mailBatchId('r2', '2026-08-24'));
  });
});

describe('suggestFromCalendar', () => {
  const now = new Date('2026-08-24T18:00:00Z');
  const rules = [rule({ pattern: 'standup', xp: 15 })];
  const rates = new Map([[WERK, 20]]);

  function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
      id: 'e1',
      title: 'Dagelijkse standup',
      startsAt: '2026-08-24T09:00:00Z',
      endsAt: '2026-08-24T09:30:00Z',
      ...over,
    };
  }

  it('suggests a matched event at the skill rate', () => {
    const [draft] = suggestFromCalendar([event()], rules, rates, now);
    // 30 minutes at 20 per 10 minutes.
    expect(draft).toMatchObject({ skillId: WERK, xp: 60, source: 'calendar' });
    expect(draft.title).toContain('30 min');
  });

  it('leaves an event still to come alone', () => {
    const later = event({ startsAt: '2026-08-24T20:00:00Z', endsAt: '2026-08-24T21:00:00Z' });
    expect(suggestFromCalendar([later], rules, rates, now)).toEqual([]);
  });

  it('leaves an unmatched event alone', () => {
    expect(suggestFromCalendar([event({ title: 'Lunch' })], rules, rates, now)).toEqual([]);
  });

  it('falls back to the rule rate when the skill has no timer tasks', () => {
    const [draft] = suggestFromCalendar([event()], rules, new Map(), now);
    // 30 minutes at the rule's 15 per 10 minutes.
    expect(draft.xp).toBe(45);
  });

  it('skips an event worth nothing', () => {
    const instant = event({ endsAt: '2026-08-24T09:00:00Z' });
    expect(suggestFromCalendar([instant], rules, rates, now)).toEqual([]);
  });

  it('gives the same event the same id every run', () => {
    const once = suggestFromCalendar([event()], rules, rates, now);
    const twice = suggestFromCalendar([event()], rules, rates, now);
    expect(once[0].externalId).toBe(twice[0].externalId);
  });
});

describe('suggestFromMail', () => {
  const rules = [rule({ source: 'mail', pattern: 'acme', xp: 25 })];

  function message(over: Partial<SentMessage> = {}): SentMessage {
    return { id: 'm1', text: 'Offerte voor Acme', sentAt: '2026-08-24T10:00:00Z', ...over };
  }

  it('counts a day of matches into one suggestion', () => {
    const drafts = suggestFromMail(
      [message({ id: 'a' }), message({ id: 'b' }), message({ id: 'c' })],
      rules,
      dayKey,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe('3 verstuurde mails · acme');
    expect(drafts[0].xp).toBe(25);
  });

  it('uses the singular for one', () => {
    expect(suggestFromMail([message()], rules, dayKey)[0].title).toBe('1 verstuurde mail · acme');
  });

  it('keeps separate days apart', () => {
    const drafts = suggestFromMail(
      [message({ id: 'a' }), message({ id: 'b', sentAt: '2026-08-25T10:00:00Z' })],
      rules,
      dayKey,
    );
    expect(drafts).toHaveLength(2);
    expect(new Set(drafts.map((d) => d.externalId)).size).toBe(2);
  });

  it('ignores mail nothing matches', () => {
    expect(suggestFromMail([message({ text: 'Iets anders' })], rules, dayKey)).toEqual([]);
  });

  it('stamps the batch with the last message in it', () => {
    const drafts = suggestFromMail(
      [message({ id: 'a', sentAt: '2026-08-24T09:00:00Z' }), message({ id: 'b', sentAt: '2026-08-24T16:00:00Z' })],
      rules,
      dayKey,
    );
    expect(drafts[0].occurredAt).toBe('2026-08-24T16:00:00Z');
  });

  it('gives the same day the same id every run, so a second sync adds nothing', () => {
    const once = suggestFromMail([message()], rules, dayKey);
    const twice = suggestFromMail([message()], rules, dayKey);
    expect(once[0].externalId).toBe(twice[0].externalId);
  });
});
