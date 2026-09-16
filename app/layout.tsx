import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Amazon.com. Spend less. Smile more.',
  description: 'A faithful amazon.com storefront clone. Unofficial demo — not affiliated with Amazon.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
