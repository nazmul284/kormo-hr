import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';

import { themeScript } from '@/components/layout/theme-toggle';
import { Providers } from '@/lib/providers';

import './globals.css';

/**
 * Asset paths in `metadata` are emitted verbatim — Next does not apply
 * `basePath` to them the way it does to `<Link>` and `next/image`. The
 * static demo is served from a sub-path, so without this every icon and
 * the web manifest 404 on the deployed site while working perfectly in
 * development, which is the worst shape a bug can take.
 */
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: {
    default: 'Kormo HR',
    template: '%s · Kormo HR',
  },
  description:
    'Kormo HR — multi-tenant people operations: onboarding, attendance and shift, '
    + 'leave, payroll and tax, performance, field force, resignation and clearance.',
  applicationName: 'Kormo HR',
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${base}/favicon.svg`, type: 'image/svg+xml' },
      { url: `${base}/favicon.ico`, sizes: '16x16 32x32 48x48' },
    ],
    apple: `${base}/apple-touch-icon.png`,
  },
  // An internal HR system should never be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6fa' },
    { media: '(prefers-color-scheme: dark)', color: '#080b14' },
  ],
};

/**
 * Geist is self-hosted by the `geist` package (two ~30kb variable files), so
 * there is no third-party font request at runtime and no layout shift from a
 * late swap — one of the reference system's weaknesses was hot-linking assets
 * off other people's domains.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint, so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
