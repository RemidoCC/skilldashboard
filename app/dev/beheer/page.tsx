import { notFound } from 'next/navigation';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { SyncBar } from '@/components/offline/SyncBar';
import { BeheerBoard } from '@/components/beheer/BeheerBoard';
import { allTasks, goals, mappingRules, skills, TODAY } from '../fixtures';

/** Visual preview of Beheer. Never reachable in a deployed build. */
export default function DevBeheerPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={null} />
        <SyncBar />
        <div className="mt-5">
          <BeheerBoard
            server={{ skills, tasks: allTasks, goals, rules: mappingRules, capacity: 'normaal' }}
            weekStart={TODAY}
            googleConfigured
            googleConnected
          />
        </div>
      </main>
      <BottomNav />
    </>
  );
}
