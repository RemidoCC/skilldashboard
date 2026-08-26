import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import type { GoalRow } from '@/lib/data/vandaag';
import type { Skill } from '@/lib/domain/types';

/** Open goals, read-only here. Editing lives in Beheer. */
export function Goals({ goals, skills }: { goals: GoalRow[]; skills: Skill[] }) {
  const byId = new Map(skills.map((s) => [s.id, s]));

  if (goals.length === 0) {
    return (
      <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
        Nog geen doelen. Je maakt ze aan in Beheer.
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-2">
      {goals.map((goal) => {
        const skill = byId.get(goal.skillId);
        return (
          <li key={goal.id} className="raised px-3 py-2.5">
            <div className="flex items-center gap-3">
              {skill ? (
                <span style={{ color: skill.color }} className="shrink-0">
                  <SkillGlyph name={skill.glyph} size={14} />
                </span>
              ) : null}
              <p className="min-w-0 flex-1 truncate text-[14px] leading-tight">{goal.title}</p>
              <span className="value shrink-0 text-[13px]">{goal.progress} procent</span>
            </div>
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--recess)' }}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={goal.progress}
              aria-label={goal.title}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${goal.progress}%`, background: 'var(--ink)' }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
