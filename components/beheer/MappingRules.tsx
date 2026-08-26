'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import { ValueSlider } from './ValueSlider';
import { ConfirmAction } from './ConfirmAction';
import type { Skill } from '@/lib/domain/types';
import type { MappingRuleRow } from '@/lib/offline/mutations';

/**
 * What the OAuth routes send back in `?google=`.
 *
 * Every outcome of an attempt gets a sentence. A consent screen you refused
 * used to return you to a page that looked exactly as before, which reads as
 * though the app lost your answer.
 */
const STATUS_NOTES: Record<string, string> = {
  gekoppeld: 'Google is gekoppeld. De eerstvolgende ronde haalt op wat er sinds gisteren was.',
  geweigerd: 'Toestemming geweigerd. Er is niets gekoppeld en niets opgeslagen.',
  ongeldig: 'De terugkomst van Google klopte niet. Begin opnieuw met koppelen.',
  mislukt: 'Koppelen mislukte. Verbreek de toegang in je Google-account en probeer opnieuw.',
  // niet-ingesteld and geen-sleutel are deliberately absent: those are standing
  // states, and the paragraph under the panel already explains both. Repeating
  // it as a notice would say the same thing twice on the same card.
};

/**
 * Which items from Google belong to which skill.
 *
 * Plain case-insensitive substrings, not patterns: a rule you can read out
 * loud is a rule you can predict. Order matters — the first match wins — so a
 * specific rule placed above a general one takes precedence.
 */
export function MappingRules({
  rules,
  skills,
  connected,
  configured,
  keyed,
  status,
}: {
  rules: MappingRuleRow[];
  skills: Skill[];
  connected: boolean;
  configured: boolean;
  keyed: boolean;
  status: string | null;
}) {
  const { mutate } = useOffline();
  const [creating, setCreating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const active = skills.filter((s) => s.active);
  const byId = new Map(skills.map((s) => [s.id, s]));
  const note = status ? STATUS_NOTES[status] : null;
  // Both have to hold before there is anything to connect to: credentials to
  // ask Google with, and a key to store the answer under.
  const canConnect = configured && keyed;

  /**
   * Every other write in the app names its failure. This one had no catch at
   * all: a dead connection left the promise rejecting into nothing, the reload
   * never ran, and the button simply came back — no word said. It also never
   * read the status, so a refusal reloaded a page where the link still stood.
   */
  async function disconnect() {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const response = await fetch('/api/integrations/google/disconnect', { method: 'POST' });
      if (!response.ok) {
        setDisconnectError('Ontkoppelen mislukte. De koppeling staat er nog.');
        setDisconnecting(false);
        return;
      }
      location.reload();
    } catch {
      setDisconnectError('Geen verbinding. Ontkoppelen kan alleen online.');
      setDisconnecting(false);
    }
  }

  return (
    <section aria-labelledby="koppelingen">
      <h2 id="koppelingen" className="label">
        Koppelingen
      </h2>

      {/* ------------------------------------------------------ de status -- */}
      <div className="raised mt-2 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] leading-tight">Google</p>
            <span className="label mt-0.5 block">
              agenda en verzonden mail, alleen lezen
            </span>
          </div>

          {!canConnect ? (
            <span className="label shrink-0">Niet ingesteld</span>
          ) : connected ? (
            <div className="shrink-0">
              <ConfirmAction
                label={disconnecting ? 'Bezig' : 'Ontkoppelen'}
                cost="De toegang tot je agenda en mail vervalt en het vernieuwingstoken wordt gewist. Je regels blijven staan."
                confirmLabel="Doe maar"
                confirmName="Doe maar, Google ontkoppelen"
                onConfirm={disconnect}
                disabled={disconnecting}
              />
            </div>
          ) : (
            <a
              href="/api/integrations/google"
              className="raised flex h-11 shrink-0 items-center px-4 text-[12px]"
              style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
            >
              Koppelen
            </a>
          )}
        </div>

        <p className="mt-2 text-[12px]" style={{ color: 'var(--muted)' }}>
          {!configured
            ? 'De sleutels van Google staan nog niet in de omgeving. Tot dan blijft alles verder gewoon werken.'
            : !keyed
              ? 'De sleutel waarmee het token versleuteld wordt ontbreekt in de omgeving (TOKEN_ENCRYPTION_KEY). Het vernieuwingstoken gaat versleuteld de database in, dus zonder die sleutel wordt er niet gekoppeld.'
              : connected
                ? 'Twee keer per dag komen afgelopen afspraken en verzonden mail binnen als voorstel. Er wordt niets vanzelf bijgeschreven.'
                : 'Na koppelen komen afgelopen afspraken en verzonden mail binnen als voorstel. Er wordt niets vanzelf bijgeschreven.'}
        </p>

        {disconnectError ? (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }} role="alert">
            {disconnectError}
          </p>
        ) : null}

        {note ? (
          <p
            role="status"
            className="mt-2 text-[12px]"
            style={{ color: status === 'gekoppeld' ? 'var(--muted)' : 'var(--signal-text)' }}
          >
            {note}
          </p>
        ) : null}
      </div>

      {/* ------------------------------------------------------- de regels -- */}
      <h3 className="label mt-4">Regels</h3>

      {rules.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Nog geen regels. Zonder regel wordt er niets voorgesteld, ook niet als Google gekoppeld
          is.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rules.map((rule) => {
            const skill = byId.get(rule.skillId);
            return (
              <li key={rule.id} className="raised px-3 py-2.5">
                <div className="flex items-center gap-3">
                  {skill ? (
                    <span style={{ color: skill.color }} className="shrink-0">
                      <SkillGlyph name={skill.glyph} size={14} />
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] leading-tight">{rule.pattern}</p>
                    <span className="label mt-0.5 block">
                      {rule.source === 'mail' ? 'mail' : 'agenda'} · {skill?.name ?? 'onbekend'} ·{' '}
                      {rule.xp} XP{rule.source === 'calendar' ? ' / 10 min' : ''}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5">
                  <ConfirmAction
                    label="Verwijderen"
                    cost={`De regel "${rule.pattern}" verdwijnt. Wat hij al voorgesteld heeft blijft staan.`}
                    confirmLabel="Doe maar"
                    confirmName={`Doe maar, de regel ${rule.pattern} verwijderen`}
                    onConfirm={() => void mutate({ kind: 'rule.delete', id: rule.id })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating ? (
        <RuleCreator skills={active} onDone={() => setCreating(false)} />
      ) : (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={active.length === 0}
            className="raised h-11 px-5 text-[13px]"
            style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
          >
            Regel toevoegen
          </button>
        </div>
      )}
    </section>
  );
}

function RuleCreator({ skills, onDone }: { skills: Skill[]; onDone: () => void }) {
  const { mutate } = useOffline();
  const [pattern, setPattern] = useState('');
  const [source, setSource] = useState<'calendar' | 'mail'>('calendar');
  const [skillId, setSkillId] = useState(skills[0]?.id ?? '');
  const [xp, setXp] = useState(20);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = pattern.trim();
    if (trimmed === '') {
      setError('Geef op waar de regel op moet zoeken.');
      return;
    }
    await mutate({
      kind: 'rule.create',
      id: crypto.randomUUID(),
      rule: { source, pattern: trimmed, skillId, xp },
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="recess mt-3 p-3">
      <label htmlFor="new-rule" className="label">
        Zoektekst
      </label>
      <input
        id="new-rule"
        type="text"
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        maxLength={80}
        placeholder="bijvoorbeeld: standup"
        className="raised mt-1.5 h-11 w-full px-3 text-[14px] outline-none"
        style={{ color: 'var(--ink)' }}
      />
      <p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>
        Komt deze tekst voor in de titel van een afspraak, of in onderwerp of geadresseerde van een
        mail, dan hoort het item bij de gekozen vaardigheid. Hoofdletters maken niet uit.
      </p>

      <fieldset className="mt-3">
        <legend className="label">Bron</legend>
        <div className="mt-1.5 flex gap-1.5">
          {(['calendar', 'mail'] as const).map((option) => {
            const selected = option === source;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setSource(option)}
                aria-pressed={selected}
                className="raised h-11 px-3 text-[12px]"
                style={{
                  background: selected ? 'var(--ink)' : undefined,
                  color: selected ? 'var(--panel)' : 'var(--ink)',
                }}
              >
                {option === 'calendar' ? 'Agenda' : 'Mail'}
              </button>
            );
          })}
        </div>
      </fieldset>

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
                className="raised flex h-11 min-w-0 max-w-full items-center gap-1.5 px-2.5 text-[12px]"
                style={{
                  background: selected ? 'var(--ink)' : undefined,
                  color: selected ? 'var(--panel)' : 'var(--ink)',
                }}
              >
                <span className="shrink-0" style={{ color: selected ? 'var(--panel)' : skill.color }}>
                  <SkillGlyph name={skill.glyph} size={12} />
                </span>
                {/* A 40-character name with no space in it used to push the row
                    to 556px and take the whole page sideways with it. */}
                <span className="truncate">{skill.name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-3">
        <ValueSlider
          value={xp}
          onChange={setXp}
          hint={
            source === 'calendar'
              ? 'Alleen een terugval: normaal rekent een afspraak met de timerwaarde van de vaardigheid zelf.'
              : 'XP voor alle mails van één dag samen.'
          }
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
