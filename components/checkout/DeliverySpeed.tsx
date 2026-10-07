'use client';
import { useState } from 'react';
import type { ShipSpeed } from '@/lib/types';
import { OptionCard } from './StepCard';

export interface SpeedOption {
  label: string;
  sub: string;
}

/**
 * Standard vs faster delivery vs the Plus member's Delivery Day (radio `shipSpeed`). The fast
 * radio has id `ship-fast` and the Delivery Day one `ship-day`, so the server-rendered order
 * summary can switch its delivery fee, total and arrival with CSS alone.
 */
export function DeliverySpeed({ standard, fast, day }: { standard: SpeedOption; fast?: SpeedOption; day?: SpeedOption }) {
  const [speed, setSpeed] = useState<ShipSpeed>('standard');
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">Delivery speed</legend>
      <OptionCard name="shipSpeed" value="standard" checked={speed === 'standard'} onChange={() => setSpeed('standard')} label={standard.label} sub={standard.sub} />
      {fast ? <OptionCard id="ship-fast" name="shipSpeed" value="fast" checked={speed === 'fast'} onChange={() => setSpeed('fast')} label={fast.label} sub={fast.sub} /> : null}
      {day ? <OptionCard id="ship-day" name="shipSpeed" value="day" checked={speed === 'day'} onChange={() => setSpeed('day')} label={day.label} sub={day.sub} /> : null}
    </fieldset>
  );
}
