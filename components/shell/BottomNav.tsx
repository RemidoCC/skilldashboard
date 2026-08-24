'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/vandaag', label: 'Vandaag' },
  { href: '/beheer', label: 'Beheer' },
  { href: '/historie', label: 'Historie' },
] as const;

/** Three tabs, thumb-reachable, 44px minimum. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="fixed inset-x-0 bottom-0 z-10 border-t"
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--edge)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className="label flex h-14 items-center justify-center"
                style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}
              >
                <span className="flex flex-col items-center gap-1.5">
                  {/* A lit bar marks the active tab: no icons, no colour wash. */}
                  <span
                    aria-hidden
                    className="block h-0.5 w-6"
                    style={{ background: active ? 'var(--signal-fill)' : 'transparent' }}
                  />
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
