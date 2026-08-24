import { SkillGlyph } from '@/components/instrument/SkillGlyph';
import type { QuestRow } from '@/lib/data/vandaag';
import type { Skill } from '@/lib/domain/types';

/** The week's three quests, with how far each has got. */
export function Quests({ quests, skills }: { quests: QuestRow[]; skills: Skill[] }) {
  const byId = new Map(skills.map((s) => [s.id, s]));

  if (quests.length === 0) {
    return (
      <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
        Weekopdrachten verschijnen maandagochtend. Je kunt ze zondag al overnemen uit het
        weekbericht.
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-2">
      {quests.map((quest) => {
        const skill = byId.get(quest.skillId);
        const fraction = Math.min(quest.progress / quest.target, 1);

        return (
          <li key={quest.id} className="raised px-3 py-2.5">
            <div className="flex items-center gap-3">
              {skill ? (
                <span style={{ color: skill.color }} className="shrink-0">
                  <SkillGlyph name={skill.glyph} size={14} />
                </span>
              ) : null}

              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[14px] leading-tight"
                  style={{ color: quest.completed ? 'var(--muted)' : 'var(--ink)' }}
                >
                  {quest.title}
                </p>
                <span className="label mt-0.5 block">
                  {quest.completed ? `af · ${quest.bonusXp} XP bijgeschreven` : `bonus ${quest.bonusXp} XP`}
                </span>
              </div>

              <span className="value shrink-0 text-[14px]">
                {Math.min(quest.progress, quest.target)}/{quest.target}
              </span>
            </div>

            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--recess)' }}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={quest.target}
              aria-valuenow={Math.min(quest.progress, quest.target)}
              aria-label={quest.title}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${fraction * 100}%`,
                  background: quest.completed ? 'var(--ink)' : 'var(--signal-fill)',
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
