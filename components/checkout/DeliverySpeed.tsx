'use client';
import { useState } from 'react';
import type { ShipSpeed } from '@/lib/types';
import { OptionCard } from './StepCard';

export interface SpeedOption {
  label: string;
  sub: string;
}

/**
 * Standard vs faster delivery (radio `shipSpeed`). The fast radio has id `ship-fast` so the
 * server-rendered order summary can switch its delivery fee and total with CSS alone.
 */
export function DeliverySpeed({ standard, fast }: { standard: SpeedOption; fast: SpeedOption }) {
  const [speed, setSpeed] = useState<ShipSpeed>('standard');
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">Delivery speed</legend>
      <OptionCard name="shipSpeed" value="standard" checked={speed === 'standard'} onChange={() => setSpeed('standard')} label={standard.label} sub={standard.sub} />
      <OptionCard id="ship-fast" name="shipSpeed" value="fast" checked={speed === 'fast'} onChange={() => setSpeed('fast')} label={fast.label} sub={fast.sub} />
    </fieldset>
  );
}
