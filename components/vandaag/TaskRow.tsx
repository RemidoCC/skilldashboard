'use client';

import { useState, useTransition } from 'react';
import { completeTask } from '@/lib/actions/log';
import { completed as feedbackCompleted, leveledUp } from '@/lib/feedback';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import { NoteField } from './NoteField';
import type { Skill, Task } from '@/lib/domain/types';

/** A check task: one tap to record it, with an optional line of text. */
export function TaskRow({ task, skill }: { task: Task; skill: Skill }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function record() {
    setError(null);
    // Optimistic: the row reports done before the network answers.
    setDone(true);
    feedbackCompleted();

    startTransition(async () => {
      const result = await completeTask({
        entryId: crypto.randomUUID(),
        taskId: task.id,
        note,
      });

      if (!result.ok) {
        setDone(false);
        setError(result.error);
        return;
      }
      if (result.leveledUp) leveledUp();
      setNote('');
      setOpen(false);
    });
  }

  return (
    <li className="raised px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span style={{ color: skill.color }} className="shrink-0">
          <SkillGlyph name={skill.glyph} size={14} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] leading-tight">{task.title}</p>
          <span className="label mt-0.5 block">
            {skill.name} · {task.value} XP
          </span>
        </div>

        <button
          type="button"
          onClick={record}
          disabled={pending || done}
          aria-label={`${task.title} afvinken`}
          className="recess grid h-11 w-11 shrink-0 place-items-center"
          style={{
            background: done ? 'var(--signal-fill)' : undefined,
            color: done ? 'var(--on-signal)' : 'var(--ink)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5 10 17.5 19 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="square"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <NoteField id={`note-${task.id}`} value={note} onChange={setNote} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="label mt-1.5 underline underline-offset-2"
        >
          Notitie toevoegen
        </button>
      )}

      {error ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
