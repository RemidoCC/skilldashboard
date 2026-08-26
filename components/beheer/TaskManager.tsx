'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import { ValueSlider } from './ValueSlider';
import type { Skill, Task, TaskKind } from '@/lib/domain/types';

const TODAY_LIMIT = 3;

export function TaskManager({ skills, tasks }: { skills: Skill[]; tasks: Task[] }) {
  const { mutate } = useOffline();
  const active = skills.filter((s) => s.active);
  const live = tasks.filter((t) => !t.archived);
  const archived = tasks.filter((t) => t.archived);
  const onToday = live.filter((t) => t.onToday).length;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const byId = new Map(skills.map((s) => [s.id, s]));

  return (
    <section aria-labelledby="taken">
      <div className="flex items-baseline justify-between">
        <h2 id="taken" className="label">
          Taken
        </h2>
        <span className="label">
          {onToday} van {TODAY_LIMIT} op vandaag
        </span>
      </div>

      {onToday > TODAY_LIMIT ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }}>
          Er staan {onToday} taken op vandaag. Het maximum is {TODAY_LIMIT}; haal er{' '}
          {onToday - TODAY_LIMIT} af.
        </p>
      ) : null}

      {active.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Zet eerst een vaardigheid aan; een taak hoort er altijd bij één.
        </p>
      ) : null}

      {live.length === 0 && active.length > 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Nog geen taken. Maak er hieronder één aan.
        </p>
      ) : null}

      <ul className="mt-2 space-y-2">
        {live.map((task) => {
          const skill = byId.get(task.skillId);
          if (!skill) return null;
          return (
            <li key={task.id} className="raised px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span style={{ color: skill.color }} className="shrink-0">
                  <SkillGlyph name={skill.glyph} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] leading-tight">{task.title}</p>
                  <span className="label mt-0.5 block">
                    {skill.name} · {task.value} XP
                    {task.kind === 'timer' ? ' / 10 min' : ''}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void mutate({ kind: 'task.update', id: task.id, patch: { onToday: !task.onToday } })}
                  aria-pressed={task.onToday}
                  className="recess h-11 px-3 text-[12px]"
                  style={{
                    background: task.onToday ? 'var(--ink)' : undefined,
                    color: task.onToday ? 'var(--panel)' : 'var(--ink)',
                  }}
                >
                  Vandaag
                </button>
              </div>

              {editing === task.id ? (
                <TaskEditor
                  task={task}
                  skills={active}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <div className="mt-1.5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(task.id)}
                    className="label-button label underline underline-offset-2"
                  >
                    Bewerken
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutate({ kind: 'task.update', id: task.id, patch: { archived: true } })}
                    className="label-button label underline underline-offset-2"
                  >
                    Archiveren
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {creating ? (
        <TaskCreator skills={active} onDone={() => setCreating(false)} />
      ) : (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={active.length === 0}
            className="raised h-11 px-5 text-[13px]"
            style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
          >
            Taak toevoegen
          </button>
        </div>
      )}

      {archived.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            className="label-button label underline underline-offset-2"
          >
            Archief · {archived.length}
          </button>
          {showArchive ? (
            <ul className="mt-2 space-y-2">
              {archived.map((task) => (
                <li key={task.id} className="recess flex items-center gap-3 px-3 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--muted)' }}>
                    {task.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => void mutate({ kind: 'task.update', id: task.id, patch: { archived: false } })}
                    className="raised h-11 px-3 text-[12px]"
                  >
                    Terughalen
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SkillChips({
  skills,
  value,
  onChange,
}: {
  skills: Skill[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="mt-3">
      <legend className="label">Vaardigheid</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {skills.map((skill) => {
          const selected = skill.id === value;
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => onChange(skill.id)}
              aria-pressed={selected}
              className="raised flex h-11 min-w-0 max-w-full items-center gap-1.5 px-2.5 text-[12px]"
              style={{
                background: selected ? 'var(--ink)' : undefined,
                color: selected ? 'var(--panel)' : 'var(--ink)',
              }}
            >
              <span className="shrink-0" style={{ color: selected ? 'var(--panel)' : skill.color }}>
                <SkillGlyph name={skill.glyph} size={12} />
              </span>
              <span className="truncate">{skill.name}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function KindChips({ value, onChange }: { value: TaskKind; onChange: (kind: TaskKind) => void }) {
  return (
    <fieldset className="mt-3">
      <legend className="label">Soort</legend>
      <div className="mt-1.5 flex gap-1.5">
        {(['check', 'timer'] as const).map((kind) => {
          const selected = kind === value;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onChange(kind)}
              aria-pressed={selected}
              className="raised h-11 px-3 text-[12px]"
              style={{
                background: selected ? 'var(--ink)' : undefined,
                color: selected ? 'var(--panel)' : 'var(--ink)',
              }}
            >
              {kind === 'check' ? 'Afvinken' : 'Timer'}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function TaskCreator({ skills, onDone }: { skills: Skill[]; onDone: () => void }) {
  const { mutate } = useOffline();
  const [title, setTitle] = useState('');
  const [skillId, setSkillId] = useState(skills[0]?.id ?? '');
  const [kind, setKind] = useState<TaskKind>('check');
  const [value, setValue] = useState(20);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '') {
      setError('Geef de taak een naam.');
      return;
    }
    await mutate({
      kind: 'task.create',
      id: crypto.randomUUID(),
      task: { skillId, title: trimmed, taskKind: kind, value, onToday: false },
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="recess mt-3 p-3">
      <label htmlFor="new-task" className="label">
        Nieuwe taak
      </label>
      <input
        id="new-task"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Wat ga je doen"
        className="raised mt-1.5 h-11 w-full px-3 text-[14px] outline-none"
        style={{ color: 'var(--ink)' }}
      />

      <SkillChips skills={skills} value={skillId} onChange={setSkillId} />
      <KindChips value={kind} onChange={setKind} />

      <div className="mt-3">
        <ValueSlider
          value={value}
          onChange={setValue}
          hint={kind === 'timer' ? 'XP per 10 minuten.' : 'XP per keer.'}
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

function TaskEditor({ task, skills, onDone }: { task: Task; skills: Skill[]; onDone: () => void }) {
  const { mutate } = useOffline();
  const [title, setTitle] = useState(task.title);
  const [skillId, setSkillId] = useState(task.skillId);
  const [kind, setKind] = useState<TaskKind>(task.kind);
  const [value, setValue] = useState(task.value);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '') return;
    await mutate({
      kind: 'task.update',
      id: task.id,
      patch: { title: trimmed, skillId, taskKind: kind, value },
    });
    onDone();
  }

  return (
    <form onSubmit={save} className="recess mt-2.5 p-3">
      <label htmlFor={`edit-${task.id}`} className="label">
        Titel
      </label>
      <input
        id={`edit-${task.id}`}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        className="raised mt-1.5 h-11 w-full px-3 text-[14px] outline-none"
        style={{ color: 'var(--ink)' }}
      />

      <SkillChips skills={skills} value={skillId} onChange={setSkillId} />
      <KindChips value={kind} onChange={setKind} />

      <div className="mt-3">
        <ValueSlider value={value} onChange={setValue} />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onDone} className="raised h-11 px-4 text-[12px]">
          Annuleren
        </button>
        <button
          type="submit"
          className="raised h-11 px-5 text-[13px]"
          style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
        >
          Opslaan
        </button>
      </div>
    </form>
  );
}
