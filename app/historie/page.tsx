import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { loadHistorie } from '@/lib/data/historie';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { SyncBar } from '@/components/offline/SyncBar';
import { HistorieView } from '@/components/historie/HistorieView';
import { toHistoryRange } from '@/lib/domain/trajectory';

export const dynamic = 'force-dynamic';

export default async function HistoriePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');

  // A plain query parameter, so the window survives a reload, a bookmark and a
  // browser with no JavaScript running yet.
  const { dagen } = await searchParams;
  const data = await loadHistorie(toHistoryRange(dagen));

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={null} />
        <SyncBar />
        <HistorieView data={data} />
      </main>
      <BottomNav />
    </>
  );
}
