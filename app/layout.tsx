import type { Metadata } from 'next';
import { Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { getMarketplace } from '@/lib/marketplace-server';
import { siteOrigin } from '@/lib/origin';
import { themeAttr } from '@/lib/theme';
import { readTheme } from '@/lib/theme-server';
import './globals.css';

// Self-hosted by next/font; exposed as CSS variables consumed by --font-sans / --font-mono (app/globals.css).
const sans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-instrument-sans',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

const metadata: Metadata = {
  title: 'Store — shop by what matters to you',
  description:
    'A decision-support demo store: tell it what matters, see every pick explained, compare with a verdict, and track prices. Unofficial demo — no real orders, not affiliated with any retailer.',
};

/** metadataBase resolves every page's relative canonical and link-preview image URLs. */
export async function generateMetadata(): Promise<Metadata> {
  return { ...metadata, metadataBase: new URL(await siteOrigin()) };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // en-US / en-IN: spelling, hyphenation and screen-reader voice follow the store
  const store = await getMarketplace();
  return (
    <html lang={store.locale.default} data-theme={themeAttr(await readTheme())} className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
