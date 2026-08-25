'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import type { Skill, Task } from '@/lib/domain/types';

/**
 * Putting a task on today without leaving the screen.
 *
 * Choosing the three is the most frequent thing you do, and it used to mean
 * switching tabs, flipping switches in Beheer and coming back. The list stays
 * folded until asked for, so the screen still opens on your three rather than
 * on everything you could do.
 */
export function PickThree({
  tasks,
  skills,
  limit,
  chosen,
}: {
  /** Not-archived tasks that are not on today. */
  tasks: Task[];
  skills: Skill[];
  limit: number;
  chosen: number;
}) {
  const { mutate } = useOffline();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const byId = new Map(skills.map((s) => [s.id, s]));

  const available = tasks.filter((task) => !added.has(task.id));
  if (available.length === 0 && !open) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label mt-2 underline underline-offset-2"
      >
        Kies uit je taken
      </button>
    );
  }

  async function put(task: Task) {
    setAdded((current) => new Set(current).add(task.id));
    await mutate({ kind: 'task.update', id: task.id, patch: { onToday: true } });
  }

  return (
    <div className="recess mt-2 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">Op vandaag zetten</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="label underline underline-offset-2"
        >
          Sluiten
        </button>
      </div>

      {chosen >= limit ? (
        <p className="mt-1.5 text-[12px]" style={{ color: 'var(--signal-text)' }}>
          Er staan er al {chosen}. Meer erbij maakt het een lijst in plaats van een keuze.
        </p>
      ) : null}

      {available.length === 0 ? (
        <p className="mt-1.5 text-[13px]" style={{ color: 'var(--muted)' }}>
          Al je taken staan op vandaag. Nieuwe maak je aan in Beheer.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {available.map((task) => {
            const skill = byId.get(task.skillId);
            return (
              <li key={task.id} className="raised flex items-center gap-3 px-3 py-2">
                {skill ? (
                  <span style={{ color: skill.color }} className="shrink-0">
                    <SkillGlyph name={skill.glyph} size={13} />
                  </span>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{task.title}</p>
                  <span className="label mt-0.5 block">
                    {skill?.name ?? 'onbekend'} · {task.value} XP
                    {task.kind === 'timer' ? ' / 10 min' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void put(task)}
                  aria-label={`${task.title} op vandaag zetten`}
                  className="recess h-11 shrink-0 px-3 text-[12px]"
                >
                  Vandaag
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
