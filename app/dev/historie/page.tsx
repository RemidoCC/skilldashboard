import { notFound } from 'next/navigation';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { SyncBar } from '@/components/offline/SyncBar';
import { HistorieView } from '@/components/historie/HistorieView';
import { historieFor } from '../fixtures';
import { toHistoryRange } from '@/lib/domain/trajectory';

/**
 * Visual preview of Historie. Never reachable in a deployed build.
 *
 * The window follows ?dagen= exactly as the real screen does, so the picker
 * can be reviewed in every state without a session.
 */
export default async function DevHistoriePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { dagen } = await searchParams;
  const historie = historieFor(toHistoryRange(dagen));

  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={null} />
        <SyncBar />
        <HistorieView data={historie} />
      </main>
      <BottomNav />
    </>
  );
}
