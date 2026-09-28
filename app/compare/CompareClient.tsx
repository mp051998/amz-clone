'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useCompare } from '@/components/decision/Compare';

/**
 * "Remove" on a compare column: drops the product from the compare tray (localStorage) and navigates
 * to the same page without it. A plain link without JS.
 */
export function RemoveFromCompare({ id, name, href, className, children }: { id: string; name: string; href: string; className?: string; children: ReactNode }) {
  const { remove } = useCompare();
  return (
    <Link href={href} scroll={false} onClick={() => remove(id)} aria-label={`Remove ${name} from compare`} className={className}>
      {children}
    </Link>
  );
}
