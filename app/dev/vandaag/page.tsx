import { notFound } from 'next/navigation';
import { Instrument } from '@/components/vandaag/Instrument';
import { Meters } from '@/components/vandaag/Meters';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { SyncBar } from '@/components/offline/SyncBar';
import { TaskRow } from '@/components/vandaag/TaskRow';
import { TimerTask } from '@/components/vandaag/TimerTask';
import { QuickLog } from '@/components/vandaag/QuickLog';
import { Quests } from '@/components/vandaag/Quests';
import { Goals } from '@/components/vandaag/Goals';
import { WeekReport } from '@/components/vandaag/WeekReport';
import { FreezeNote } from '@/components/vandaag/FreezeNote';
import { Inbox } from '@/components/vandaag/Inbox';
import { PickThree } from '@/components/vandaag/PickThree';
import {
  balanceSentence,
  frozenDays,
  heldFreezes,
  allTasks,
  inbox,
  nextWeekStart,
  openGoals,
  questCandidates,
  quests,
  seasonLabel,
  skills,
  streak,
  tasks,
  TODAY,
  weekReport,
  xpToday,
} from '../fixtures';

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
        <Header screen="Vandaag" seasonLabel={seasonLabel} />

        <SyncBar />

        <Instrument
          skills={skills}
          today={TODAY}
          capacity="normaal"
          balanceSentence={balanceSentence}
          serverXpToday={xpToday}
          streakDays={streak}
          quests={{
            total: quests.length,
            completed: quests.filter((q) => q.completed).length,
          }}
        />

        <FreezeNote frozenDays={frozenDays} held={heldFreezes} />

        <WeekReport
          report={weekReport}
          candidates={questCandidates}
          nextWeekStart={nextWeekStart}
          reportKey="dev-preview"
          nextCapacity="normaal"
        />

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
                <TimerTask key={task.id} task={task} skill={skill} streakDays={streak} />
              ) : (
                <TaskRow key={task.id} task={task} skill={skill} streakDays={streak} />
              );
            })}
          </ul>
          <PickThree
            tasks={allTasks.filter((t) => !t.onToday && !t.archived)}
            skills={skills}
            limit={3}
            chosen={tasks.length}
          />
        </section>

        <Inbox items={inbox} skills={skills} />

        <section className="mt-6" aria-label="Snel loggen">
          <QuickLog skills={skills} streakDays={streak} />
        </section>

        <section className="mt-6" aria-labelledby="meters">
          <h2 id="meters" className="label">
            Vaardigheden
          </h2>
          <Meters skills={skills} today={TODAY} capacity="normaal" />
        </section>

        <section className="mt-6" aria-labelledby="opdrachten">
          <div className="flex items-baseline justify-between">
            <h2 id="opdrachten" className="label">
              Opdrachten
            </h2>
            <span className="label">
              {quests.filter((q) => q.completed).length} van {quests.length} af
            </span>
          </div>
          <Quests quests={quests} skills={skills} />
        </section>

        <section className="mt-6" aria-labelledby="doelen">
          <h2 id="doelen" className="label">
            Doelen
          </h2>
          <Goals goals={openGoals} skills={skills} />
        </section>
      </main>

      <BottomNav />
    </>
  );
}
