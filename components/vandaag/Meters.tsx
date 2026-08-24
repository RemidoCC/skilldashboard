'use client';

import { Meter } from '@/components/instrument/Meter';
import { useOptimisticSkills } from '@/lib/hooks/useOptimisticSkills';
import { readMeters } from '@/lib/domain/meters';
import type { Capacity, Skill } from '@/lib/domain/types';

/** One gauge per active skill, moved by queued writes just like the display. */
export function Meters({
  skills,
  today,
  capacity,
}: {
  skills: Skill[];
  today: string;
  capacity: Capacity;
}) {
  const { skills: optimistic } = useOptimisticSkills(skills);
  const meters = readMeters(optimistic, today, capacity);

  if (meters.length === 0) {
    return (
      <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
        Geen actieve vaardigheden. Zet er minstens één aan in Beheer.
      </p>
    );
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {meters.map(({ skill, fraction, rust }) => (
        <Meter
          key={skill.id}
          name={skill.name}
          glyph={skill.glyph}
          color={skill.color}
          level={skill.level}
          fraction={fraction}
          rusting={rust.status !== 'ok'}
        />
      ))}
    </div>
  );
}
