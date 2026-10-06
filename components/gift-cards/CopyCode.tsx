'use client';
import { CopyField } from '../primitives/CopyField';

/** A gift card code in a read-only field with a Copy button. */
export function CopyCode({ code }: { code: string }) {
  return <CopyField value={code} label="Gift card code" copied="Code copied" mono />;
}
