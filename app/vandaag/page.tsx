import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { loadVandaag } from '@/lib/data/vandaag';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { Instrument } from '@/components/vandaag/Instrument';
import { Meters } from '@/components/vandaag/Meters';
import { SyncBar } from '@/components/offline/SyncBar';
import { InstallPrompt } from '@/components/offline/InstallPrompt';
import { TaskRow } from '@/components/vandaag/TaskRow';
import { TimerTask } from '@/components/vandaag/TimerTask';
import { QuickLog } from '@/components/vandaag/QuickLog';
import { Quests } from '@/components/vandaag/Quests';
import { Goals } from '@/components/vandaag/Goals';
import { WeekReport } from '@/components/vandaag/WeekReport';
import { FreezeNote } from '@/components/vandaag/FreezeNote';
import { Inbox } from '@/components/vandaag/Inbox';
import { PickThree } from '@/components/vandaag/PickThree';

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
  // Quick logging writes to a skill, so with none switched on it is not on
  // offer — and pointing at it would be pointing at nothing.
  const canQuickLog = data.skills.some((s) => s.active);

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header screen="Vandaag" seasonLabel={data.seasonLabel} />

        <SyncBar />
        <InstallPrompt />

        <Instrument
          skills={data.skills}
          today={data.today}
          capacity={data.capacity}
          balanceSentence={data.balanceSentence}
          serverXpToday={data.xpToday}
          streakDays={data.streakDays}
          quests={
            data.quests.length > 0
              ? {
                  total: data.quests.length,
                  completed: data.quests.filter((q) => q.completed).length,
                }
              : null
          }
        />

        <FreezeNote frozenDays={data.frozenDays} held={data.freezes.filter((f) => f.spentOn === null).length} />

        {/* Below the display, not above it. On a Sunday the report used to push
            the instrument to 793px and the first tick to 1070px — 1.3 screens
            of scrolling to do the one thing you open the app for. */}
        {data.report ? (
          <WeekReport
            report={data.report}
            candidates={data.questCandidates}
            nextWeekStart={data.nextWeekStart}
            reportKey={data.reportKey}
            nextCapacity={data.nextCapacity}
          />
        ) : null}

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
              Er staan {today.length} taken op vandaag. Het maximum is {TODAY_LIMIT}; haal er{' '}
              {today.length - TODAY_LIMIT} af in Beheer.
            </p>
          ) : null}

          {today.length === 0 ? (
            <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
              Nog niets voor vandaag. Zet in Beheer maximaal drie taken op vandaag
              {canQuickLog ? ', of noteer hieronder direct wat je gedaan hebt.' : '.'}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {today.map((task) => {
                const skill = skillsById.get(task.skillId);
                if (!skill) return null;
                return task.kind === 'timer' ? (
                  <TimerTask
                    key={task.id}
                    task={task}
                    skill={skill}
                    streakDays={data.streakDays}
                  />
                ) : (
                  <TaskRow key={task.id} task={task} skill={skill} streakDays={data.streakDays} />
                );
              })}
            </ul>
          )}
          <PickThree
            tasks={data.tasks.filter((t) => !t.onToday && !t.archived)}
            skills={data.skills}
            limit={TODAY_LIMIT}
            chosen={today.length}
          />
        </section>

        {/* Absent entirely when Google is not connected. */}
        <Inbox items={data.inbox} skills={data.skills} />

        {/* --------------------------------------------------- snel loggen -- */}
        <section className="mt-6" aria-label="Snel loggen">
          <QuickLog
            skills={data.skills.filter((s) => s.active)}
            streakDays={data.streakDays}
          />
        </section>

        {/* --------------------------------------------------------- meters -- */}
        <section className="mt-6" aria-labelledby="meters">
          <h2 id="meters" className="label">
            Vaardigheden
          </h2>
          <Meters skills={data.skills} today={data.today} capacity={data.capacity} />
        </section>

        {/* ------------------------------------------------ quests en doelen -- */}
        <section className="mt-6" aria-labelledby="opdrachten">
          <div className="flex items-baseline justify-between">
            <h2 id="opdrachten" className="label">
              Opdrachten
            </h2>
            {data.quests.length > 0 ? (
              <span className="label">
                {data.quests.filter((q) => q.completed).length} van {data.quests.length} af
              </span>
            ) : null}
          </div>
          <Quests quests={data.quests} skills={data.skills} />
        </section>

        <section className="mt-6" aria-labelledby="doelen">
          <h2 id="doelen" className="label">
            Doelen
          </h2>
          <Goals goals={data.goals} skills={data.skills} />
        </section>
      </main>

      <BottomNav />
    </>
  );
}
