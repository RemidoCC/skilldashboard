import { notFound } from 'next/navigation';
import { Header } from '@/components/shell/Header';
import { BottomNav } from '@/components/shell/BottomNav';
import { SyncBar } from '@/components/offline/SyncBar';
import { HistorieView } from '@/components/historie/HistorieView';
import { historie } from '../fixtures';

/** Visual preview of Historie. Never reachable in a deployed build. */
export default function DevHistoriePage() {
  if (process.env.NODE_ENV === 'production') notFound();

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
