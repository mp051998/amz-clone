'use client'; // error boundaries are Client Components
import { ErrorScreen } from '@/components/chrome/ErrorScreen';

/** Any page that throws while rendering (e.g. the database is unreachable). */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
