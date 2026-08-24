'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import { GlyphPicker } from './GlyphPicker';
import { ColorPicker, SKILL_COLORS } from './ColorPicker';
import type { Skill, SkillGlyph as GlyphName } from '@/lib/domain/types';

/** Past this, the same effort is spread over more meters and each moves less. */
const DILUTION_LIMIT = 6;

export function SkillManager({ skills }: { skills: Skill[] }) {
  const { mutate } = useOffline();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const active = skills.filter((s) => s.active);
  const off = skills.filter((s) => !s.active);

  return (
    <section aria-labelledby="vaardigheden">
      <div className="flex items-baseline justify-between">
        <h2 id="vaardigheden" className="label">
          Vaardigheden
        </h2>
        <span className="label">{active.length} aan</span>
      </div>

      {active.length > DILUTION_LIMIT ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }}>
          {active.length} vaardigheden staan aan. Dezelfde inspanning wordt over meer meters
          verdeeld, dus elke meter beweegt minder. Zes is de bovengrens die scherp blijft.
        </p>
      ) : null}

      <ul className="mt-2 space-y-2">
        {skills.map((skill) => (
          <li key={skill.id} className="raised px-3 py-2.5">
            <div className="flex items-center gap-3">
              <span style={{ color: skill.active ? skill.color : 'var(--muted)' }} className="shrink-0">
                <SkillGlyph name={skill.glyph} size={14} />
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[14px] leading-tight"
                  style={{ color: skill.active ? 'var(--ink)' : 'var(--muted)' }}
                >
                  {skill.name}
                </p>
                <span className="label mt-0.5 block">
                  {skill.subtitle ? `${skill.subtitle} · ` : ''}niveau {skill.level}
                  {skill.floorLevel > 0 ? ` · vloer ${skill.floorLevel}` : ''}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void mutate({ kind: 'skill.update', id: skill.id, patch: { active: !skill.active } })}
                aria-pressed={skill.active}
                className="recess h-11 px-3 text-[12px]"
                style={{
                  background: skill.active ? 'var(--ink)' : undefined,
                  color: skill.active ? 'var(--panel)' : 'var(--ink)',
                }}
              >
                {skill.active ? 'Aan' : 'Uit'}
              </button>
            </div>

            {editing === skill.id ? (
              <SkillEditor skill={skill} onDone={() => setEditing(null)} />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(skill.id)}
                className="label mt-1.5 underline underline-offset-2"
              >
                Bewerken
              </button>
            )}
          </li>
        ))}
      </ul>

      {off.length > 0 ? (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--muted)' }}>
          Uitgezette vaardigheden houden hun niveau en hun vloer. Ze tellen alleen niet mee zolang
          ze uit staan.
        </p>
      ) : null}

      {creating ? (
        <SkillCreator nextSortOrder={skills.length + 1} onDone={() => setCreating(false)} />
      ) : (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="raised h-11 px-5 text-[13px]"
            style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
          >
            Vaardigheid toevoegen
          </button>
        </div>
      )}
    </section>
  );
}

function SkillCreator({ nextSortOrder, onDone }: { nextSortOrder: number; onDone: () => void }) {
  const { mutate } = useOffline();
  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [glyph, setGlyph] = useState<GlyphName>('square');
  const [color, setColor] = useState<string>(SKILL_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Geef de vaardigheid een naam.');
      return;
    }
    await mutate({
      kind: 'skill.create',
      id: crypto.randomUUID(),
      skill: {
        name: trimmed,
        subtitle: subtitle.trim() === '' ? null : subtitle.trim(),
        color,
        glyph,
        sortOrder: nextSortOrder,
      },
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="recess mt-3 p-3">
      <label htmlFor="new-skill" className="label">
        Nieuwe vaardigheid
      </label>
      <input
        id="new-skill"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="Naam"
        className="raised mt-1.5 h-11 w-full px-3 text-[14px] outline-none"
        style={{ color: 'var(--ink)' }}
      />

      <input
        type="text"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
        maxLength={80}
        placeholder="Ondertitel, optioneel"
        aria-label="Ondertitel, optioneel"
        className="raised mt-2 h-11 w-full px-3 text-[13px] outline-none"
        style={{ color: 'var(--ink)' }}
      />

      <div className="mt-3">
        <GlyphPicker value={glyph} onChange={setGlyph} />
      </div>
      <div className="mt-3">
        <ColorPicker value={color} onChange={setColor} />
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

function SkillEditor({ skill, onDone }: { skill: Skill; onDone: () => void }) {
  const { mutate } = useOffline();
  const [name, setName] = useState(skill.name);
  const [subtitle, setSubtitle] = useState(skill.subtitle ?? '');
  const [glyph, setGlyph] = useState<GlyphName>(skill.glyph);
  const [color, setColor] = useState(skill.color);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    await mutate({
      kind: 'skill.update',
      id: skill.id,
      patch: {
        name: trimmed,
        subtitle: subtitle.trim() === '' ? null : subtitle.trim(),
        glyph,
        color,
      },
    });
    onDone();
  }

  return (
    <form onSubmit={save} className="recess mt-2.5 p-3">
      <label htmlFor={`skill-${skill.id}`} className="label">
        Naam
      </label>
      <input
        id={`skill-${skill.id}`}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        className="raised mt-1.5 h-11 w-full px-3 text-[14px] outline-none"
        style={{ color: 'var(--ink)' }}
      />

      <input
        type="text"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
        maxLength={80}
        placeholder="Ondertitel, optioneel"
        aria-label="Ondertitel, optioneel"
        className="raised mt-2 h-11 w-full px-3 text-[13px] outline-none"
        style={{ color: 'var(--ink)' }}
      />

      <div className="mt-3">
        <GlyphPicker value={glyph} onChange={setGlyph} />
      </div>
      <div className="mt-3">
        <ColorPicker value={color} onChange={setColor} />
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
