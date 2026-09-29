import type { Metadata } from 'next';
import { Instrument_Sans, JetBrains_Mono } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Store — shop by what matters to you',
  description:
    'A decision-support demo store: tell it what matters, see every pick explained, compare with a verdict, and track prices. Unofficial demo — no real orders, not affiliated with any retailer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
