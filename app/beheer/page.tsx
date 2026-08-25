import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { loadBeheer } from '@/lib/data/beheer';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { SyncBar } from '@/components/offline/SyncBar';
import { BeheerBoard } from '@/components/beheer/BeheerBoard';

export const dynamic = 'force-dynamic';

export default async function BeheerPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const data = await loadBeheer();

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={null} />
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
          />
        </div>
      </main>
      <BottomNav />
    </>
  );
}
