import { describe, expect, it } from 'vitest';
import { proposeForGoal } from '@/lib/domain/proposals';

describe('proposeForGoal', () => {
  it('offers between three and five tasks and one quest', () => {
    const { tasks, quest } = proposeForGoal('Drie vaste klanten');
    expect(tasks.length).toBeGreaterThanOrEqual(3);
    expect(tasks.length).toBeLessThanOrEqual(5);
    expect(quest).toBeDefined();
  });

  it('names each proposal after the goal', () => {
    const { tasks, quest } = proposeForGoal('Drie vaste klanten');
    for (const task of tasks) expect(task.title).toContain('Drie vaste klanten');
    expect(quest.title).toContain('Drie vaste klanten');
  });

  it('gives every proposal a distinct key so they can be accepted one by one', () => {
    const { tasks } = proposeForGoal('Iets');
    expect(new Set(tasks.map((t) => t.key)).size).toBe(tasks.length);
  });

  it('offers at least one timer and one check', () => {
    const { tasks } = proposeForGoal('Iets');
    expect(tasks.some((t) => t.taskKind === 'timer')).toBe(true);
    expect(tasks.some((t) => t.taskKind === 'check')).toBe(true);
  });

  it('scales values to what the skill already uses', () => {
    const modest = proposeForGoal('Iets', [10, 10, 15]);
    const heavy = proposeForGoal('Iets', [80, 100, 120]);
    expect(modest.tasks[0].value).toBeLessThan(heavy.tasks[0].value);
  });

  it('keeps every value on the slider: 5 to 150, in steps of 5', () => {
    for (const values of [[], [5], [150, 150], [7, 13, 22]]) {
      for (const task of proposeForGoal('Iets', values).tasks) {
        expect(task.value % 5).toBe(0);
        expect(task.value).toBeGreaterThanOrEqual(5);
        expect(task.value).toBeLessThanOrEqual(150);
      }
    }
  });

  it('never proposes something heavier than the skill already uses', () => {
    const { tasks } = proposeForGoal('Iets', [20, 20, 20]);
    for (const task of tasks) expect(task.value).toBeLessThanOrEqual(20);
  });

  it('proposes nothing straight onto today', () => {
    // Confirming a proposal must not quietly fill up the three.
    for (const task of proposeForGoal('Iets').tasks) expect(task.onToday).toBe(false);
  });

  it('shortens a long goal so the task title stays readable', () => {
    const long = 'Een doel met een uitzonderlijk lange omschrijving die nooit in een taaknaam past';
    const { tasks } = proposeForGoal(long);
    for (const task of tasks) expect(task.title.length).toBeLessThan(70);
    expect(tasks[0].title).toContain('…');
  });

  it('tidies stray whitespace', () => {
    expect(proposeForGoal('  Twee   spaties  ').tasks[0].title).toBe('Werken aan Twee spaties');
  });

  it('ignores nonsense values when sizing', () => {
    const { tasks } = proposeForGoal('Iets', [0, -5, 20]);
    for (const task of tasks) expect(task.value).toBeGreaterThan(0);
  });
});
