import { describe, expect, it } from 'vitest';
import { applyMutations, type BeheerState, type Mutation, type PendingMutation } from '@/lib/offline/mutations';
import type { Skill, Task } from '@/lib/domain/types';

const SKILL_A = '11111111-1111-4111-8111-111111111111';
const SKILL_B = '22222222-2222-4222-8222-222222222222';
const TASK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function skill(id: string, name: string, active = true): Skill {
  return {
    id,
    name,
    subtitle: null,
    color: '#5C7A99',
    glyph: 'square',
    level: 1,
    xp: 0,
    floorLevel: 0,
    lastActiveAt: null,
    active,
    sortOrder: 1,
  };
}

function task(id: string, skillId: string): Task {
  return { id, skillId, title: 'Bestaand', kind: 'check', value: 20, onToday: false, archived: false };
}

const base: BeheerState = {
  skills: [skill(SKILL_A, 'Werk'), skill(SKILL_B, 'Podium', false)],
  tasks: [task(TASK_A, SKILL_A)],
  goals: [],
  capacity: 'normaal',
};

let clock = 0;
function queued(mutation: Mutation): PendingMutation {
  clock += 1;
  return {
    queueId: String(clock).padStart(4, '0'),
    mutation,
    createdAt: '2026-08-24T10:00:00.000Z',
    attempts: 0,
  };
}

describe('applyMutations', () => {
  it('returns the state untouched when nothing is queued', () => {
    expect(applyMutations(base, [])).toEqual(base);
  });

  it('does not mutate the state it was given', () => {
    const before = structuredClone(base);
    applyMutations(base, [queued({ kind: 'goal.create', id: NEW_ID, goal: { skillId: SKILL_A, title: 'X', targetDate: null } })]);
    expect(base).toEqual(before);
  });

  describe('tasks', () => {
    it('adds a created task', () => {
      const next = applyMutations(base, [
        queued({
          kind: 'task.create',
          id: NEW_ID,
          task: { skillId: SKILL_A, title: 'Nieuw', taskKind: 'timer', value: 25, onToday: true },
        }),
      ]);
      expect(next.tasks).toHaveLength(2);
      expect(next.tasks[1]).toMatchObject({ id: NEW_ID, title: 'Nieuw', kind: 'timer', value: 25, onToday: true, archived: false });
    });

    it('does not duplicate a create that is replayed', () => {
      const create = queued({
        kind: 'task.create',
        id: NEW_ID,
        task: { skillId: SKILL_A, title: 'Nieuw', taskKind: 'check', value: 10, onToday: false },
      });
      expect(applyMutations(base, [create, create]).tasks).toHaveLength(2);
    });

    it('applies only the fields a patch names', () => {
      const next = applyMutations(base, [queued({ kind: 'task.update', id: TASK_A, patch: { value: 45 } })]);
      expect(next.tasks[0]).toMatchObject({ value: 45, title: 'Bestaand', onToday: false });
    });

    it('lets a later edit win over an earlier one', () => {
      const next = applyMutations(base, [
        queued({ kind: 'task.update', id: TASK_A, patch: { value: 45 } }),
        queued({ kind: 'task.update', id: TASK_A, patch: { value: 60 } }),
      ]);
      expect(next.tasks[0].value).toBe(60);
    });

    it('archives without removing the row', () => {
      const next = applyMutations(base, [queued({ kind: 'task.update', id: TASK_A, patch: { archived: true } })]);
      expect(next.tasks[0].archived).toBe(true);
    });

    it('can edit a task that was itself created in the queue', () => {
      const next = applyMutations(base, [
        queued({ kind: 'task.create', id: NEW_ID, task: { skillId: SKILL_A, title: 'Nieuw', taskKind: 'check', value: 10, onToday: false } }),
        queued({ kind: 'task.update', id: NEW_ID, patch: { onToday: true } }),
      ]);
      expect(next.tasks.find((t) => t.id === NEW_ID)?.onToday).toBe(true);
    });

    it('ignores a patch for a task that is not there', () => {
      const next = applyMutations(base, [queued({ kind: 'task.update', id: NEW_ID, patch: { value: 50 } })]);
      expect(next.tasks).toEqual(base.tasks);
    });
  });

  describe('skills', () => {
    it('switches one on', () => {
      const next = applyMutations(base, [queued({ kind: 'skill.update', id: SKILL_B, patch: { active: true } })]);
      expect(next.skills.find((s) => s.id === SKILL_B)?.active).toBe(true);
    });

    it('adds a custom skill at level one', () => {
      const next = applyMutations(base, [
        queued({
          kind: 'skill.create',
          id: NEW_ID,
          skill: { name: 'Tuin', subtitle: null, color: '#6E8C5A', glyph: 'ring', sortOrder: 9 },
        }),
      ]);
      expect(next.skills[2]).toMatchObject({ name: 'Tuin', level: 1, xp: 0, active: true, glyph: 'ring' });
    });

    it('never invents progress for a new skill', () => {
      const next = applyMutations(base, [
        queued({ kind: 'skill.create', id: NEW_ID, skill: { name: 'Tuin', subtitle: null, color: '#6E8C5A', glyph: 'ring', sortOrder: 9 } }),
      ]);
      expect(next.skills[2]).toMatchObject({ floorLevel: 0, lastActiveAt: null });
    });

    it('leaves level and XP alone when renaming', () => {
      const earned: BeheerState = { ...base, skills: [{ ...skill(SKILL_A, 'Werk'), level: 7, xp: 400 }] };
      const next = applyMutations(earned, [queued({ kind: 'skill.update', id: SKILL_A, patch: { name: 'Loondienst' } })]);
      expect(next.skills[0]).toMatchObject({ name: 'Loondienst', level: 7, xp: 400 });
    });
  });

  describe('goals', () => {
    it('adds, updates and removes', () => {
      const created = applyMutations(base, [
        queued({ kind: 'goal.create', id: NEW_ID, goal: { skillId: SKILL_A, title: 'Certificaat', targetDate: '2026-12-01' } }),
      ]);
      expect(created.goals[0]).toMatchObject({ title: 'Certificaat', progress: 0, done: false });

      const updated = applyMutations(created, [queued({ kind: 'goal.update', id: NEW_ID, patch: { progress: 40 } })]);
      expect(updated.goals[0].progress).toBe(40);

      const removed = applyMutations(updated, [queued({ kind: 'goal.delete', id: NEW_ID })]);
      expect(removed.goals).toHaveLength(0);
    });

    it('survives a delete of something that was never there', () => {
      expect(applyMutations(base, [queued({ kind: 'goal.delete', id: NEW_ID })]).goals).toEqual([]);
    });
  });

  describe('week capacity', () => {
    it('takes the last one set', () => {
      const next = applyMutations(base, [
        queued({ kind: 'week.capacity', weekStart: '2026-08-24', capacity: 'gek' }),
        queued({ kind: 'week.capacity', weekStart: '2026-08-24', capacity: 'rustig' }),
      ]);
      expect(next.capacity).toBe('rustig');
    });
  });

  it('replays a whole session of edits in order', () => {
    const next = applyMutations(base, [
      queued({ kind: 'skill.update', id: SKILL_B, patch: { active: true } }),
      queued({ kind: 'task.create', id: NEW_ID, task: { skillId: SKILL_B, title: 'Repeteren', taskKind: 'timer', value: 15, onToday: true } }),
      queued({ kind: 'task.update', id: TASK_A, patch: { archived: true } }),
      queued({ kind: 'week.capacity', weekStart: '2026-08-24', capacity: 'rustig' }),
    ]);

    expect(next.skills.find((s) => s.id === SKILL_B)?.active).toBe(true);
    expect(next.tasks.find((t) => t.id === NEW_ID)?.title).toBe('Repeteren');
    expect(next.tasks.find((t) => t.id === TASK_A)?.archived).toBe(true);
    expect(next.capacity).toBe('rustig');
  });
});
