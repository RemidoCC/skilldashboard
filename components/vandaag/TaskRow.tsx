'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { completed as feedbackCompleted } from '@/lib/feedback';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import { NoteField } from './NoteField';
import { earnedXp } from '@/lib/domain/xp';
import type { Skill, Task } from '@/lib/domain/types';

/**
 * A check task: one tap to record it, with an optional line of text.
 *
 * The tap never waits on the network. It writes to the queue, the meters move
 * straight away, and the server's authoritative XP arrives on the next
 * refresh.
 */
export function TaskRow({ task, skill, streakDays }: { task: Task; skill: Skill; streakDays: number }) {
  const { record } = useOffline();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  async function tap() {
    setDone(true);
    feedbackCompleted();

    await record({
      id: crypto.randomUUID(),
      kind: 'task',
      skillId: skill.id,
      title: task.title,
      // Provisional: the server recomputes this from the streak it sees.
      xp: earnedXp({ kind: 'check', value: task.value }, streakDays),
      taskId: task.id,
      minutes: null,
      note: note.trim() === '' ? null : note.trim(),
      occurredAt: new Date().toISOString(),
    });

    setNote('');
    setOpen(false);
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
          onClick={tap}
          disabled={done}
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

      {done ? null : open ? (
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
    </li>
  );
}
