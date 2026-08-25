'use client';

import { useState } from 'react';
import { useOffline } from '@/components/offline/OfflineProvider';
import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import { readableDay } from '@/lib/domain/dates';
import { dayKey } from '@/lib/domain/dates';
import type { InboxRow } from '@/lib/data/vandaag';
import type { Skill } from '@/lib/domain/types';

const SOURCE_LABEL: Record<InboxRow['source'], string> = {
  calendar: 'agenda',
  mail: 'mail',
};

/**
 * Suggestions from Google, waiting for a tap.
 *
 * Nothing here has awarded anything yet. That is the whole point of the
 * inbox: the integrations may be wrong about what a meeting was, so a
 * suggestion only becomes XP when you say so.
 *
 * When Google is not connected the list is empty and the section is not
 * rendered at all.
 */
export function Inbox({ items, skills }: { items: InboxRow[]; skills: Skill[] }) {
  const { mutate } = useOffline();
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const byId = new Map(skills.map((s) => [s.id, s]));

  const open = items.filter((item) => !resolved.has(item.id));
  if (open.length === 0) return null;

  async function resolve(id: string, accept: boolean) {
    setResolved((current) => new Set(current).add(id));
    await mutate({ kind: 'inbox.resolve', id, accept });
  }

  return (
    <section className="mt-6" aria-labelledby="inbox">
      <div className="flex items-baseline justify-between">
        <h2 id="inbox" className="label">
          Voorstellen
        </h2>
        <span className="label">{open.length}</span>
      </div>

      <ul className="mt-2 space-y-2">
        {open.map((item) => {
          const skill = item.skillId ? byId.get(item.skillId) : undefined;
          return (
            <li key={item.id} className="raised px-3 py-2.5">
              <div className="flex items-start gap-3">
                {skill ? (
                  <span style={{ color: skill.color }} className="mt-0.5 shrink-0">
                    <SkillGlyph name={skill.glyph} size={14} />
                  </span>
                ) : null}

                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-tight">{item.title}</p>
                  <span className="label mt-0.5 block">
                    {SOURCE_LABEL[item.source]} · {readableDay(dayKey(item.occurredAt))} ·{' '}
                    {item.xp} XP
                  </span>
                </div>
              </div>

              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void resolve(item.id, false)}
                  className="raised h-11 px-4 text-[12px]"
                >
                  Weg
                </button>
                <button
                  type="button"
                  onClick={() => void resolve(item.id, true)}
                  disabled={!skill}
                  className="raised h-11 px-4 text-[13px]"
                  style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
                >
                  Tel mee
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
