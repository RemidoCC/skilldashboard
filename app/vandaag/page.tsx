import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { loadVandaag } from '@/lib/data/vandaag';
import { Display } from '@/components/instrument/Display';
import { Meter } from '@/components/instrument/Meter';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { TaskRow } from '@/components/vandaag/TaskRow';
import { TimerTask } from '@/components/vandaag/TimerTask';
import { QuickLog } from '@/components/vandaag/QuickLog';

/** Reads live state on every visit; nothing here is worth caching. */
export const dynamic = 'force-dynamic';

const TODAY_LIMIT = 3;

export default async function VandaagPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const data = await loadVandaag();
  const skillsById = new Map(data.skills.map((s) => [s.id, s]));
  const today = data.tasks.filter((t) => t.onToday);
  const overflowing = today.length > TODAY_LIMIT;

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={data.seasonLabel} />

        <div className="mt-3">
          <Display tier={data.tier} statusLines={data.statusLines} streakDays={data.streakDays} />
        </div>

        {/* ------------------------------------------------------ je drie -- */}
        <section className="mt-6" aria-labelledby="je-drie">
          <div className="flex items-baseline justify-between">
            <h2 id="je-drie" className="label">
              Je drie
            </h2>
            <span className="label">
              {today.length} van {TODAY_LIMIT}
            </span>
          </div>

          {overflowing ? (
            <p className="mt-2 text-[12px]" style={{ color: 'var(--signal-text)' }}>
              Er staan {today.length} taken op vandaag. Drie is het maximum dat scherp blijft;
              haal er {today.length - TODAY_LIMIT} af in Beheer.
            </p>
          ) : null}

          {today.length === 0 ? (
            <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
              Nog niets voor vandaag. Zet in Beheer maximaal drie taken op vandaag, of noteer
              hieronder direct wat je gedaan hebt.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {today.map((task) => {
                const skill = skillsById.get(task.skillId);
                if (!skill) return null;
                return task.kind === 'timer' ? (
                  <TimerTask key={task.id} task={task} skill={skill} />
                ) : (
                  <TaskRow key={task.id} task={task} skill={skill} />
                );
              })}
            </ul>
          )}
        </section>

        {/* --------------------------------------------------- snel loggen -- */}
        <section className="mt-6" aria-label="Snel loggen">
          <QuickLog skills={data.skills.filter((s) => s.active)} />
        </section>

        {/* --------------------------------------------------------- meters -- */}
        <section className="mt-6" aria-labelledby="meters">
          <h2 id="meters" className="label">
            Vaardigheden
          </h2>
          {data.meters.length === 0 ? (
            <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
              Geen actieve vaardigheden. Zet er minstens één aan in Beheer.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {data.meters.map(({ skill, fraction, rust }) => (
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
          )}
        </section>

        {/* ------------------------------------------------ quests en doelen -- */}
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
