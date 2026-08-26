'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { ValueSlider } from './ValueSlider';
import { proposeForGoal, type GoalProposals as Proposals } from '@/lib/domain/proposals';
import type { Skill, TaskKind } from '@/lib/domain/types';

interface Draft {
  key: string;
  title: string;
  taskKind: TaskKind;
  value: number;
  rejected: boolean;
  editing: boolean;
}

/**
 * What a new goal suggests, offered rather than applied.
 *
 * Every line can be edited or thrown out, and nothing reaches the database
 * until it is confirmed. A goal that silently filled the task list would be
 * the app deciding what you work on.
 */
export function GoalProposalFlow({
  goalTitle,
  skill,
  existingValues,
  weekStart,
  onDone,
}: {
  goalTitle: string;
  skill: Skill;
  existingValues: number[];
  weekStart: string;
  onDone: () => void;
}) {
  const { mutate } = useOffline();
  const [proposals] = useState<Proposals>(() => proposeForGoal(goalTitle, existingValues));
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    proposals.tasks.map((task) => ({
      key: task.key,
      title: task.title,
      taskKind: task.taskKind,
      value: task.value,
      rejected: false,
      editing: false,
    })),
  );
  const [questRejected, setQuestRejected] = useState(false);
  const [saving, setSaving] = useState(false);

  const kept = drafts.filter((d) => !d.rejected);

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  async function confirm() {
    setSaving(true);
    for (const draft of kept) {
      await mutate({
        kind: 'task.create',
        id: crypto.randomUUID(),
        task: {
          skillId: skill.id,
          title: draft.title,
          taskKind: draft.taskKind,
          value: draft.value,
          onToday: false,
        },
      });
    }

    if (!questRejected) {
      await mutate({
        kind: 'quest.accept',
        weekStart,
        quests: [
          {
            skillId: skill.id,
            title: proposals.quest.title,
            target: proposals.quest.target,
            bonusXp: proposals.quest.bonusXp,
          },
        ],
      });
    }

    onDone();
  }

  return (
    <div className="recess mt-3 p-3">
      <h3 className="label">Voorstellen bij dit doel</h3>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>
        Niets wordt aangemaakt tot je het bevestigt. Pas aan wat niet klopt, gooi weg wat je niet
        wilt.
      </p>

      <ul className="mt-2.5 space-y-2">
        {drafts.map((draft) => (
          <li
            key={draft.key}
            className="raised px-3 py-2.5"
            style={{ opacity: draft.rejected ? 0.5 : 1 }}
          >
            {draft.editing ? (
              <>
                <label htmlFor={`draft-${draft.key}`} className="label">
                  Titel
                </label>
                <input
                  id={`draft-${draft.key}`}
                  type="text"
                  value={draft.title}
                  onChange={(e) => update(draft.key, { title: e.target.value })}
                  maxLength={120}
                  className="recess mt-1.5 h-11 w-full px-3 text-[14px] outline-none"
                  style={{ color: 'var(--ink)' }}
                />
                <div className="mt-2.5">
                  <ValueSlider
                    value={draft.value}
                    onChange={(value) => update(draft.key, { value })}
                    hint={draft.taskKind === 'timer' ? 'XP per 10 minuten.' : 'XP per keer.'}
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => update(draft.key, { editing: false })}
                    className="raised h-11 px-4 text-[12px]"
                  >
                    Klaar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p
                  className="text-[14px] leading-tight"
                  style={{
                    color: draft.rejected ? 'var(--muted)' : 'var(--ink)',
                    textDecoration: draft.rejected ? 'line-through' : 'none',
                  }}
                >
                  {draft.title}
                </p>
                <span className="label mt-0.5 block">
                  {draft.taskKind === 'timer' ? 'timer' : 'afvinken'} · {draft.value} XP
                </span>
                <div className="mt-1.5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => update(draft.key, { editing: true, rejected: false })}
                    className="label-button label underline underline-offset-2"
                  >
                    Aanpassen
                  </button>
                  <button
                    type="button"
                    onClick={() => update(draft.key, { rejected: !draft.rejected })}
                    className="label-button label underline underline-offset-2"
                  >
                    {draft.rejected ? 'Toch houden' : 'Weg ermee'}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}

        <li className="raised px-3 py-2.5" style={{ opacity: questRejected ? 0.5 : 1 }}>
          <p
            className="text-[14px] leading-tight"
            style={{
              color: questRejected ? 'var(--muted)' : 'var(--ink)',
              textDecoration: questRejected ? 'line-through' : 'none',
            }}
          >
            {proposals.quest.title}
          </p>
          <span className="label mt-0.5 block">
            weekopdracht · bonus {proposals.quest.bonusXp} XP
          </span>
          <button
            type="button"
            onClick={() => setQuestRejected((v) => !v)}
            className="label-button label mt-1.5 underline underline-offset-2"
          >
            {questRejected ? 'Toch houden' : 'Weg ermee'}
          </button>
        </li>
      </ul>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="raised h-11 px-4 text-[12px]">
          Niets aanmaken
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={saving || (kept.length === 0 && questRejected)}
          className="raised h-11 px-5 text-[13px]"
          style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
        >
          {/* "Maak 3 + 1 aan" never said what the one was. */}
          {kept.length === 0 && !questRejected
            ? 'Maak alleen de opdracht aan'
            : `Maak ${kept.length} ${kept.length === 1 ? 'taak' : 'taken'}${
                questRejected ? '' : ' en 1 opdracht'
              } aan`}
        </button>
      </div>
    </div>
  );
}
