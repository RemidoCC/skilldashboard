import { describe, expect, it } from 'vitest';
import { dutchNumber, statusLines } from '@/lib/domain/status';

const bare = { xpToday: 0, balanceSentence: null, quests: null, rust: null };

describe('dutchNumber', () => {
  it('spells out the small numbers', () => {
    expect(dutchNumber(0)).toBe('nul');
    expect(dutchNumber(9)).toBe('negen');
    expect(dutchNumber(20)).toBe('twintig');
  });

  it('falls back to digits past twenty', () => {
    expect(dutchNumber(21)).toBe('21');
  });
});

describe('statusLines', () => {
  it('always reports today, even with nothing logged', () => {
    expect(statusLines(bare)).toEqual(['Vandaag nog niets gelogd.']);
  });

  it('reports the XP total once there is one', () => {
    expect(statusLines({ ...bare, xpToday: 120 })[0]).toBe('Vandaag 120 XP.');
  });

  it('includes the balance sentence when there is one', () => {
    const lines = statusLines({ ...bare, balanceSentence: 'Werk nam 71 procent.' });
    expect(lines).toContain('Werk nam 71 procent.');
  });

  it('leaves out quests when there are none', () => {
    expect(statusLines({ ...bare, quests: { total: 0, completed: 0 } })).toHaveLength(1);
  });

  it('reports quest standings', () => {
    const lines = statusLines({ ...bare, quests: { total: 3, completed: 1 } });
    expect(lines).toContain('een van drie opdrachten af.');
  });

  it('reports a finished set of quests plainly', () => {
    const lines = statusLines({ ...bare, quests: { total: 3, completed: 3 } });
    expect(lines).toContain('Alle drie opdrachten staan af.');
  });

  it('uses the brief’s phrasing for a stalled skill', () => {
    const lines = statusLines({
      ...bare,
      rust: { name: 'Gezondheid', daysInactive: 9, daysUntilRust: 0, status: 'rusting' },
    });
    expect(lines).toContain('Gezondheid staat negen dagen stil.');
  });

  it('counts down to rust', () => {
    const lines = statusLines({
      ...bare,
      rust: { name: 'Werk', daysInactive: 8, daysUntilRust: 2, status: 'warning' },
    });
    expect(lines).toContain('Werk roest over twee dagen.');
  });

  it('uses the singular for one day', () => {
    const lines = statusLines({
      ...bare,
      rust: { name: 'Werk', daysInactive: 9, daysUntilRust: 1, status: 'warning' },
    });
    expect(lines).toContain('Werk roest over een dag.');
  });

  it('never uses an exclamation mark', () => {
    const lines = statusLines({
      xpToday: 200,
      balanceSentence: 'Werk nam 71 procent van je XP in twee weken, Gezin 4 procent.',
      quests: { total: 3, completed: 2 },
      rust: { name: 'Gezin', daysInactive: 12, daysUntilRust: 0, status: 'rusting' },
    });
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(line).not.toContain('!');
  });
});
