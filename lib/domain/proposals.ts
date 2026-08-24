import type { TaskKind } from './types';

/**
 * What a new goal suggests.
 *
 * These are scaffolding, not insight: the app has no model reading the goal,
 * so it offers a shape that most goals need — regular work, a weekly step, and
 * a moment to look back — filled in with the goal's own name. Every one is
 * editable and none is created without a tap, which is the point of the flow.
 */
export interface TaskProposal {
  /** Stable within one proposal set, so accept and reject can address them. */
  key: string;
  title: string;
  taskKind: TaskKind;
  value: number;
  onToday: boolean;
}

export interface QuestProposal {
  key: string;
  title: string;
  target: number;
  bonusXp: number;
}

export interface GoalProposals {
  tasks: TaskProposal[];
  quest: QuestProposal;
}

/** Trims a goal title down to something that reads inside a task name. */
function shorten(title: string, max = 40): string {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Three to five tasks and one weekly quest.
 *
 * The typical value of the skill's existing tasks sets the scale, so a
 * proposal does not quietly introduce a heavier task than anything else the
 * skill has.
 */
export function proposeForGoal(
  goalTitle: string,
  existingValues: readonly number[] = [],
): GoalProposals {
  const short = shorten(goalTitle);

  // Median of what the skill already uses, or a modest default.
  const sorted = [...existingValues].filter((v) => v > 0).sort((a, b) => a - b);
  const typical =
    sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 20;
  const round5 = (n: number) => Math.min(Math.max(Math.round(n / 5) * 5, 5), 150);

  const tasks: TaskProposal[] = [
    {
      key: 'work',
      title: `Werken aan ${short}`,
      taskKind: 'timer',
      value: round5(typical),
      onToday: false,
    },
    {
      key: 'step',
      title: `Eén stap voor ${short}`,
      taskKind: 'check',
      value: round5(typical),
      onToday: false,
    },
    {
      key: 'prepare',
      title: `Voorbereiden voor ${short}`,
      taskKind: 'check',
      value: round5(typical * 0.75),
      onToday: false,
    },
    {
      key: 'review',
      title: `Voortgang ${short} nakijken`,
      taskKind: 'check',
      value: round5(typical * 0.5),
      onToday: false,
    },
  ];

  return {
    tasks,
    quest: {
      key: 'weekly',
      title: `Drie keer aan ${short}`,
      target: 3,
      bonusXp: 60,
    },
  };
}
