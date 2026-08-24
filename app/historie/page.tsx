import { BottomNav } from '@/components/shell/BottomNav';
import { Header } from '@/components/shell/Header';

export default function HistoriePage() {
  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={null} />
        <h2 className="label mt-6">Historie</h2>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Niveauverloop, logboek en seizoensbadges komen hier in fase 3.
        </p>
      </main>
      <BottomNav />
    </>
  );
}
