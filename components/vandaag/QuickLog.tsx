'use client';

import { useState, useTransition } from 'react';
import { quickLog } from '@/lib/actions/log';
import { completed as feedbackCompleted, leveledUp } from '@/lib/feedback';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import type { Skill } from '@/lib/domain/types';

const MIN = 5;
const MAX = 150;
const STEP = 5;

/** Records something that was never on the list: text, a skill, a value. */
export function QuickLog({ skills }: { skills: Skill[] }) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [skillId, setSkillId] = useState(skills[0]?.id ?? '');
  const [xp, setXp] = useState(20);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmed(null);

    startTransition(async () => {
      const result = await quickLog({
        entryId: crypto.randomUUID(),
        skillId,
        title,
        xp,
        note,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      feedbackCompleted();
      if (result.leveledUp) leveledUp();
      setConfirmed(`${result.xp} XP genoteerd.`);
      setTitle('');
      setNote('');
    });
  }

  if (skills.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
        Zet eerst een vaardigheid aan in Beheer.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="recess p-3">
      <label htmlFor="quick-title" className="label">
        Snel loggen
      </label>
      <input
        id="quick-title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Wat heb je gedaan"
        maxLength={120}
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

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <span className="label">Waarde</span>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setXp((v) => Math.max(v - STEP, MIN))}
              aria-label="Waarde omlaag"
              className="raised h-11 w-11 text-[16px]"
            >
              −
            </button>
            <span className="value w-14 text-center text-[16px]" aria-live="polite">
              {xp}
            </span>
            <button
              type="button"
              onClick={() => setXp((v) => Math.min(v + STEP, MAX))}
              aria-label="Waarde omhoog"
              className="raised h-11 w-11 text-[16px]"
            >
              +
            </button>
          </div>
        </div>

        {/* Primary action, lower right. */}
        <button
          type="submit"
          disabled={pending}
          className="raised h-11 px-5 text-[13px]"
          style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
        >
          {pending ? 'Bezig' : 'Noteer'}
        </button>
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={280}
        placeholder="Notitie, optioneel"
        aria-label="Notitie, optioneel"
        className="raised mt-3 h-11 w-full px-3 text-[13px] outline-none"
        style={{ color: 'var(--ink)' }}
      />

      {error ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
          {error}
        </p>
      ) : null}
      {confirmed ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--muted)' }} role="status">
          {confirmed}
        </p>
      ) : null}
    </form>
  );
}
