'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import type { Skill } from '@/lib/domain/types';
import type { Goal } from '@/lib/offline/mutations';

export function GoalManager({ skills, goals }: { skills: Skill[]; goals: Goal[] }) {
  const { mutate } = useOffline();
  const [creating, setCreating] = useState(false);
  const active = skills.filter((s) => s.active);
  const byId = new Map(skills.map((s) => [s.id, s]));

  const open = goals.filter((g) => !g.done);
  const done = goals.filter((g) => g.done);

  return (
    <section aria-labelledby="doelen">
      <h2 id="doelen" className="label">
        Doelen
      </h2>

      {goals.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Nog geen doelen. Een doel geeft richting aan een vaardigheid over langere tijd.
        </p>
      ) : null}

      <ul className="mt-2 space-y-2">
        {[...open, ...done].map((goal) => {
          const skill = byId.get(goal.skillId);
          return (
            <li key={goal.id} className="raised px-3 py-2.5">
              <div className="flex items-start gap-3">
                {skill ? (
                  <span style={{ color: skill.color }} className="mt-0.5 shrink-0">
                    <SkillGlyph name={skill.glyph} size={14} />
                  </span>
                ) : null}

                <div className="min-w-0 flex-1">
                  <p
                    className="text-[14px] leading-tight"
                    style={{ color: goal.done ? 'var(--muted)' : 'var(--ink)' }}
                  >
                    {goal.title}
                  </p>
                  <span className="label mt-0.5 block">
                    {skill?.name ?? 'Onbekend'}
                    {goal.targetDate ? ` · voor ${goal.targetDate}` : ''}
                    {goal.done ? ' · afgerond' : ` · ${goal.progress} procent`}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void mutate({ kind: 'goal.update', id: goal.id, patch: { done: !goal.done } })}
                  aria-pressed={goal.done}
                  className="recess h-11 px-3 text-[12px]"
                  style={{
                    background: goal.done ? 'var(--ink)' : undefined,
                    color: goal.done ? 'var(--panel)' : 'var(--ink)',
                  }}
                >
                  {goal.done ? 'Klaar' : 'Afronden'}
                </button>
              </div>

              {goal.done ? null : (
                <div className="mt-2.5">
                  <label htmlFor={`progress-${goal.id}`} className="label">
                    Voortgang
                  </label>
                  <input
                    id={`progress-${goal.id}`}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={goal.progress}
                    onChange={(e) =>
                      void mutate({
                        kind: 'goal.update',
                        id: goal.id,
                        patch: { progress: Number(e.target.value) },
                      })
                    }
                    className="mt-1.5 h-11 w-full accent-[var(--signal-fill)]"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => void mutate({ kind: 'goal.delete', id: goal.id })}
                className="label mt-1 underline underline-offset-2"
              >
                Verwijderen
              </button>
            </li>
          );
        })}
      </ul>

      {creating ? (
        <GoalCreator skills={active} onDone={() => setCreating(false)} />
      ) : (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={active.length === 0}
            className="raised h-11 px-5 text-[13px]"
            style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
          >
            Doel toevoegen
          </button>
        </div>
      )}

      <p className="mt-2 text-[12px]" style={{ color: 'var(--muted)' }}>
        Een nieuw doel stelt straks zelf drie tot vijf taken en een weekopdracht voor. Dat komt in
        fase 4; tot dan maak je de taken zelf aan.
      </p>
    </section>
  );
}

function GoalCreator({ skills, onDone }: { skills: Skill[]; onDone: () => void }) {
  const { mutate } = useOffline();
  const [title, setTitle] = useState('');
  const [skillId, setSkillId] = useState(skills[0]?.id ?? '');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '') {
      setError('Geef het doel een naam.');
      return;
    }
    await mutate({
      kind: 'goal.create',
      id: crypto.randomUUID(),
      goal: { skillId, title: trimmed, targetDate: targetDate === '' ? null : targetDate },
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="recess mt-3 p-3">
      <label htmlFor="new-goal" className="label">
        Nieuw doel
      </label>
      <input
        id="new-goal"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Waar werk je naartoe"
        className="raised mt-1.5 h-11 w-full px-3 text-[14px] outline-none"
        style={{ color: 'var(--ink)' }}
      />

      <fieldset className="mt-3">
        <legend className="label">Vaardigheid</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {skills.map((skill) => {
            const selected = skill.id === skillId;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => setSkillId(skill.id)}
                aria-pressed={selected}
                className="raised flex h-11 items-center gap-1.5 px-2.5 text-[12px]"
                style={{
                  background: selected ? 'var(--ink)' : undefined,
                  color: selected ? 'var(--panel)' : 'var(--ink)',
                }}
              >
                <span style={{ color: selected ? 'var(--panel)' : skill.color }}>
                  <SkillGlyph name={skill.glyph} size={12} />
                </span>
                {skill.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-3">
        <label htmlFor="goal-date" className="label">
          Streefdatum, optioneel
        </label>
        <input
          id="goal-date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="raised mt-1.5 h-11 w-full px-3 text-[13px] outline-none"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      {error ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="raised h-11 px-4 text-[12px]">
          Annuleren
        </button>
        <button
          type="submit"
          className="raised h-11 px-5 text-[13px]"
          style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
        >
          Aanmaken
        </button>
      </div>
    </form>
  );
}
