import { notFound } from 'next/navigation';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { SyncBar } from '@/components/offline/SyncBar';
import { BeheerBoard } from '@/components/beheer/BeheerBoard';
import { allTasks, goals, mappingRules, skills, TODAY } from '../fixtures';

/**
 * Visual preview of Beheer. Never reachable in a deployed build.
 *
 * The two Google flags are drivable from the query string, because the states
 * that matter most — no credentials, no encryption key, a refused consent —
 * are exactly the ones you cannot reach by clicking around.
 */
export default async function DevBeheerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const params = await searchParams;
  const status = typeof params.google === 'string' ? params.google : 'gekoppeld';

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={null} />
        <SyncBar />
        <div className="mt-5">
          <BeheerBoard
            server={{ skills, tasks: allTasks, goals, rules: mappingRules, capacity: 'normaal' }}
            weekStart={TODAY}
            googleConfigured={params.sleutels !== 'nee'}
            googleConnected={params.gekoppeld !== 'nee'}
            googleKeyed={params.sleutel !== 'nee'}
            googleStatus={status}
          />
        </div>
      </main>
      <BottomNav />
    </>
  );
}
