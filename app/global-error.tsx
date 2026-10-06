'use client'; // error boundaries are Client Components
import { ErrorScreen } from '@/components/chrome/ErrorScreen';
import './globals.css';

/**
 * Errors in the root layout itself. This replaces the layout, so it brings its own <html>/<body>
 * and styles; with no data-theme it follows the system light / dark setting.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Store</title>
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
