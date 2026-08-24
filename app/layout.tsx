import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import { SelfTestProvider } from '@/components/instrument/SelfTest';
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
        <SelfTestProvider>{children}</SelfTestProvider>
      </body>
    </html>
  );
}
