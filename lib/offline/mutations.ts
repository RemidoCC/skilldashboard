import type { Capacity, Skill, SkillGlyph, Task, TaskKind } from '@/lib/domain/types';

/**
 * Everything Beheer can change, expressed as a queued mutation.
 *
 * Completions have their own store because they are additive and idempotent by
 * entry id. These are different: they edit rows, so replay order matters and a
 * later write simply wins. The client generates row ids, so a create replayed
 * twice lands once.
 */
export type Mutation =
  | { kind: 'task.create'; id: string; task: NewTask }
  | { kind: 'task.update'; id: string; patch: TaskPatch }
  | { kind: 'skill.create'; id: string; skill: NewSkill }
  | { kind: 'skill.update'; id: string; patch: SkillPatch }
  | { kind: 'goal.create'; id: string; goal: NewGoal }
  | { kind: 'goal.update'; id: string; patch: GoalPatch }
  | { kind: 'goal.delete'; id: string }
  | { kind: 'week.capacity'; weekStart: string; capacity: Capacity }
  | { kind: 'quest.accept'; weekStart: string; quests: AcceptedQuest[] }
  | { kind: 'inbox.resolve'; id: string; accept: boolean }
  | { kind: 'rule.create'; id: string; rule: NewMappingRule }
  | { kind: 'rule.delete'; id: string }
  | { kind: 'entry.revert'; id: string };

export interface NewMappingRule {
  source: 'calendar' | 'mail';
  pattern: string;
  skillId: string;
  xp: number;
}

export interface AcceptedQuest {
  skillId: string;
  title: string;
  target: number;
  bonusXp: number;
}

export interface NewTask {
  skillId: string;
  title: string;
  taskKind: TaskKind;
  value: number;
  onToday: boolean;
}

export interface TaskPatch {
  title?: string;
  skillId?: string;
  taskKind?: TaskKind;
  value?: number;
  onToday?: boolean;
  archived?: boolean;
}

export interface NewSkill {
  name: string;
  subtitle: string | null;
  color: string;
  glyph: SkillGlyph;
  sortOrder: number;
}

export interface SkillPatch {
  name?: string;
  subtitle?: string | null;
  color?: string;
  glyph?: SkillGlyph;
  active?: boolean;
  sortOrder?: number;
}

export interface NewGoal {
  skillId: string;
  title: string;
  targetDate: string | null;
}

export interface GoalPatch {
  title?: string;
  targetDate?: string | null;
  progress?: number;
  done?: boolean;
}

export interface Goal {
  id: string;
  skillId: string;
  title: string;
  targetDate: string | null;
  progress: number;
  done: boolean;
}

/** A queued mutation, as stored. */
export interface PendingMutation {
  /** Queue key. Ordering is by this, so it must sort by time. */
  queueId: string;
  mutation: Mutation;
  createdAt: string;
  attempts: number;
}

export interface MappingRuleRow extends NewMappingRule {
  id: string;
}

export interface BeheerState {
  skills: Skill[];
  tasks: Task[];
  goals: Goal[];
  rules: MappingRuleRow[];
  capacity: Capacity;
}

/**
 * Replays queued mutations onto server state.
 *
 * The same fold runs on the client for the optimistic view and in the tests
 * that check the endpoint agrees, so what Beheer shows while offline is what
 * the database will hold once the queue drains. Last write wins: a later
 * mutation in the queue simply overwrites an earlier one.
 */
export function applyMutations(
  state: BeheerState,
  mutations: readonly PendingMutation[],
): BeheerState {
  let skills = [...state.skills];
  let tasks = [...state.tasks];
  let goals = [...state.goals];
  let rules = [...state.rules];
  let capacity = state.capacity;

  for (const { mutation } of mutations) {
    switch (mutation.kind) {
      case 'task.create': {
        // A replayed create must not duplicate the row.
        if (tasks.some((t) => t.id === mutation.id)) break;
        tasks = [
          ...tasks,
          {
            id: mutation.id,
            skillId: mutation.task.skillId,
            title: mutation.task.title,
            kind: mutation.task.taskKind,
            value: mutation.task.value,
            onToday: mutation.task.onToday,
            archived: false,
          },
        ];
        break;
      }
      case 'task.update': {
        tasks = tasks.map((task) =>
          task.id === mutation.id
            ? {
                ...task,
                ...(mutation.patch.title !== undefined && { title: mutation.patch.title }),
                ...(mutation.patch.skillId !== undefined && { skillId: mutation.patch.skillId }),
                ...(mutation.patch.taskKind !== undefined && { kind: mutation.patch.taskKind }),
                ...(mutation.patch.value !== undefined && { value: mutation.patch.value }),
                ...(mutation.patch.onToday !== undefined && { onToday: mutation.patch.onToday }),
                ...(mutation.patch.archived !== undefined && { archived: mutation.patch.archived }),
              }
            : task,
        );
        break;
      }
      case 'skill.create': {
        if (skills.some((s) => s.id === mutation.id)) break;
        skills = [
          ...skills,
          {
            id: mutation.id,
            name: mutation.skill.name,
            subtitle: mutation.skill.subtitle,
            color: mutation.skill.color,
            glyph: mutation.skill.glyph,
            level: 1,
            xp: 0,
            floorLevel: 0,
            lastActiveAt: null,
            active: true,
            sortOrder: mutation.skill.sortOrder,
          },
        ];
        break;
      }
      case 'skill.update': {
        skills = skills.map((skill) =>
          skill.id === mutation.id
            ? {
                ...skill,
                ...(mutation.patch.name !== undefined && { name: mutation.patch.name }),
                ...(mutation.patch.subtitle !== undefined && { subtitle: mutation.patch.subtitle }),
                ...(mutation.patch.color !== undefined && { color: mutation.patch.color }),
                ...(mutation.patch.glyph !== undefined && { glyph: mutation.patch.glyph }),
                ...(mutation.patch.active !== undefined && { active: mutation.patch.active }),
                ...(mutation.patch.sortOrder !== undefined && {
                  sortOrder: mutation.patch.sortOrder,
                }),
              }
            : skill,
        );
        break;
      }
      case 'goal.create': {
        if (goals.some((g) => g.id === mutation.id)) break;
        goals = [
          ...goals,
          {
            id: mutation.id,
            skillId: mutation.goal.skillId,
            title: mutation.goal.title,
            targetDate: mutation.goal.targetDate,
            progress: 0,
            done: false,
          },
        ];
        break;
      }
      case 'goal.update': {
        goals = goals.map((goal) =>
          goal.id === mutation.id
            ? {
                ...goal,
                ...(mutation.patch.title !== undefined && { title: mutation.patch.title }),
                ...(mutation.patch.targetDate !== undefined && {
                  targetDate: mutation.patch.targetDate,
                }),
                ...(mutation.patch.progress !== undefined && { progress: mutation.patch.progress }),
                ...(mutation.patch.done !== undefined && { done: mutation.patch.done }),
              }
            : goal,
        );
        break;
      }
      case 'goal.delete': {
        goals = goals.filter((goal) => goal.id !== mutation.id);
        break;
      }
      case 'week.capacity': {
        capacity = mutation.capacity;
        break;
      }
      case 'quest.accept':
      case 'entry.revert':
      case 'inbox.resolve': {
        // Neither is part of the Beheer state this fold describes; both are
        // read from the server after the queue drains.
        break;
      }
      case 'rule.create': {
        if (rules.some((r) => r.id === mutation.id)) break;
        rules = [...rules, { id: mutation.id, ...mutation.rule }];
        break;
      }
      case 'rule.delete': {
        rules = rules.filter((r) => r.id !== mutation.id);
        break;
      }
    }
  }

  return { skills, tasks, goals, rules, capacity };
}
