import { BottomNav } from '@/components/shell/BottomNav';
import { Header } from '@/components/shell/Header';

export default function BeheerPage() {
  return (
    <>
      <main className="mx-auto max-w-md px-4 pb-24">
        <Header seasonLabel={null} />
        <h2 className="label mt-6">Beheer</h2>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Taken, vaardigheden, doelen en instellingen komen hier in fase 3.
        </p>
      </main>
      <BottomNav />
    </>
  );
}
