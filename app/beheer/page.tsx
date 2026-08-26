import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { loadBeheer } from '@/lib/data/beheer';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { SyncBar } from '@/components/offline/SyncBar';
import { BeheerBoard } from '@/components/beheer/BeheerBoard';

export const dynamic = 'force-dynamic';

export default async function BeheerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');

  const [data, params] = await Promise.all([loadBeheer(), searchParams]);
  // Set by the OAuth routes on the way back. Without it a refused consent
  // simply returns you to a screen that looks unchanged.
  const googleStatus = typeof params.google === 'string' ? params.google : null;

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header screen="Beheer" seasonLabel={null} />
        <SyncBar />

        <div className="mt-5">
          <BeheerBoard
            server={{
              skills: data.skills,
              tasks: data.tasks,
              goals: data.goals,
              rules: data.rules,
              capacity: data.capacity,
            }}
            weekStart={data.weekStart}
            googleConfigured={data.googleConfigured}
            googleConnected={data.googleConnected}
            googleKeyed={data.googleKeyed}
            googleStatus={googleStatus}
          />
        </div>
      </main>
      <BottomNav />
    </>
  );
}
