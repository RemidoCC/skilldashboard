import { notFound } from 'next/navigation';
import { Display } from '@/components/instrument/Display';
import { Meter } from '@/components/instrument/Meter';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { TaskRow } from '@/components/vandaag/TaskRow';
import { TimerTask } from '@/components/vandaag/TimerTask';
import { QuickLog } from '@/components/vandaag/QuickLog';
import { lines, meters, seasonLabel, skills, streak, tasks, tier } from '../fixtures';

/**
 * Visual preview of Vandaag against fixture state, for checking the design
 * against the spec and for the screenshot pass. Never reachable in a deployed
 * build; the real screen lives at /vandaag and reads the database.
 */
export default function DevVandaagPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const skillsById = new Map(skills.map((s) => [s.id, s]));

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={seasonLabel} />

        <div className="mt-3">
          <Display tier={tier} statusLines={lines} streakDays={streak} />
        </div>

        <section className="mt-6" aria-labelledby="je-drie">
          <div className="flex items-baseline justify-between">
            <h2 id="je-drie" className="label">
              Je drie
            </h2>
            <span className="label">{tasks.length} van 3</span>
          </div>
          <ul className="mt-2 space-y-2">
            {tasks.map((task) => {
              const skill = skillsById.get(task.skillId)!;
              return task.kind === 'timer' ? (
                <TimerTask key={task.id} task={task} skill={skill} />
              ) : (
                <TaskRow key={task.id} task={task} skill={skill} />
              );
            })}
          </ul>
        </section>

        <section className="mt-6" aria-label="Snel loggen">
          <QuickLog skills={skills} />
        </section>

        <section className="mt-6" aria-labelledby="meters">
          <h2 id="meters" className="label">
            Vaardigheden
          </h2>
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
        </section>

        <section className="mt-6" aria-labelledby="opdrachten">
          <h2 id="opdrachten" className="label">
            Opdrachten
          </h2>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
            Weekopdrachten verschijnen hier zodra ze maandagochtend gezet worden.
          </p>
        </section>

        <section className="mt-6" aria-labelledby="doelen">
          <h2 id="doelen" className="label">
            Doelen
          </h2>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
            Nog geen doelen. Je maakt ze aan in Beheer.
          </p>
        </section>
      </main>

      <BottomNav />
    </>
  );
}
