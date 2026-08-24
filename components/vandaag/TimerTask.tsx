'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { completeTask } from '@/lib/actions/log';
import { completed as feedbackCompleted, leveledUp } from '@/lib/feedback';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import { NoteField } from './NoteField';
import { timerXp } from '@/lib/domain/xp';
import type { Skill, Task } from '@/lib/domain/types';

const KEY_PREFIX = 'skillunit.timer.';

function readStart(taskId: string): number | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + taskId);
    if (!raw) return null;
    const parsed = Number(raw);
    // A stored value from the future means a clock change; ignore it.
    return Number.isFinite(parsed) && parsed > 0 && parsed <= Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function writeStart(taskId: string, at: number | null): void {
  try {
    if (at === null) localStorage.removeItem(KEY_PREFIX + taskId);
    else localStorage.setItem(KEY_PREFIX + taskId, String(at));
  } catch {
    // Storage blocked: the timer still runs, it just will not survive a reload.
  }
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * A timer task. The start timestamp lives in localStorage, so closing the app
 * mid-session and coming back later picks the same session up rather than
 * losing it.
 */
export function TimerTask({ task, skill }: { task: Task; skill: Skill }) {
  const [pending, startTransition] = useTransition();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recover a session that was running before the page was reloaded.
  useEffect(() => {
    const stored = readStart(task.id);
    if (stored !== null) {
      setStartedAt(stored);
      setElapsed(Math.floor((Date.now() - stored) / 1000));
    }
  }, [task.id]);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    // Recomputed from the timestamp each tick, so a throttled background tab
    // catches up instead of drifting.
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const start = useCallback(() => {
    const at = Date.now();
    setStartedAt(at);
    setElapsed(0);
    writeStart(task.id, at);
    feedbackCompleted();
  }, [task.id]);

  const cancel = useCallback(() => {
    setStartedAt(null);
    setElapsed(0);
    writeStart(task.id, null);
  }, [task.id]);

  function stop() {
    if (startedAt === null) return;
    const minutes = Math.round((Date.now() - startedAt) / 60000);
    setError(null);
    setStartedAt(null);
    setElapsed(0);
    writeStart(task.id, null);
    feedbackCompleted();

    startTransition(async () => {
      const result = await completeTask({
        entryId: crypto.randomUUID(),
        taskId: task.id,
        minutes,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.leveledUp) leveledUp();
      setNote('');
      setOpen(false);
    });
  }

  const running = startedAt !== null;
  const projected = timerXp(Math.round(elapsed / 60), task.value);

  return (
    <li className="raised px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span style={{ color: skill.color }} className="shrink-0">
          <SkillGlyph name={skill.glyph} size={14} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] leading-tight">{task.title}</p>
          <span className="label mt-0.5 block">
            {skill.name} · {task.value} XP / 10 min
          </span>
        </div>

        {running ? (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="value text-[15px] leading-none">{clock(elapsed)}</p>
              <span className="label mt-1 block">{projected} XP</span>
            </div>
            <button
              type="button"
              onClick={stop}
              disabled={pending}
              className="recess h-11 min-w-11 shrink-0 px-3 text-[12px]"
              style={{ color: 'var(--signal-text)' }}
            >
              Stop
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={pending}
            aria-label={`Timer starten voor ${task.title}`}
            className="recess h-11 min-w-11 shrink-0 px-3 text-[12px]"
          >
            Start
          </button>
        )}
      </div>

      {running ? (
        <button type="button" onClick={cancel} className="label mt-1.5 underline underline-offset-2">
          Annuleren zonder loggen
        </button>
      ) : open ? (
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
