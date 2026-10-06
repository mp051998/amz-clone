'use client';
import { buttonClasses } from '../primitives/Button';

/** Opens the browser's print dialog (print or save as PDF). */
export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClasses({ variant: 'primary' })}>
      {label}
    </button>
  );
}
