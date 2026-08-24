import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import { SelfTestProvider } from '@/components/instrument/SelfTest';
import { OfflineProvider } from '@/components/offline/OfflineProvider';
import { ServiceWorkerRegistrar } from '@/components/offline/ServiceWorkerRegistrar';
import { themeBoot } from '@/lib/theme';
import './globals.css';

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Skill Unit',
  description: 'Meetinstrument voor wat je werkelijk doet.',
  applicationName: 'Skill Unit',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Skill Unit',
    // iOS has no dark variant here, and the panel reads correctly either way.
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E4E3DE' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1B19' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        {/* Resolves day or night before first paint, so the panel is never
            briefly the wrong colour. themeBoot is self-contained by design. */}
        <script
          dangerouslySetInnerHTML={{ __html: `(${themeBoot.toString()})();` }}
        />
      </head>
      <body className={plexMono.variable}>
        <SelfTestProvider>
          <OfflineProvider>{children}</OfflineProvider>
        </SelfTestProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
