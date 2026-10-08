'use client';
import { useState } from 'react';
import type { ShipSpeed } from '@/lib/types';
import { OptionCard } from './StepCard';

export interface SpeedOption {
  label: string;
  sub: string;
}

/**
 * Standard vs faster delivery vs the Plus member's Delivery Day vs No-Rush Shipping (radio
 * `shipSpeed`). The fast radio has id `ship-fast`, the Delivery Day one `ship-day` and the
 * No-Rush one `ship-no-rush`, so the server-rendered order summary can switch its delivery fee,
 * total, arrival and reward with CSS alone.
 */
export function DeliverySpeed({ standard, fast, day, noRush }: { standard: SpeedOption; fast?: SpeedOption; day?: SpeedOption; noRush?: SpeedOption }) {
  const [speed, setSpeed] = useState<ShipSpeed>('standard');
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">Delivery speed</legend>
      <OptionCard name="shipSpeed" value="standard" checked={speed === 'standard'} onChange={() => setSpeed('standard')} label={standard.label} sub={standard.sub} />
      {fast ? <OptionCard id="ship-fast" name="shipSpeed" value="fast" checked={speed === 'fast'} onChange={() => setSpeed('fast')} label={fast.label} sub={fast.sub} /> : null}
      {day ? <OptionCard id="ship-day" name="shipSpeed" value="day" checked={speed === 'day'} onChange={() => setSpeed('day')} label={day.label} sub={day.sub} /> : null}
      {noRush ? (
        <OptionCard id="ship-no-rush" name="shipSpeed" value="no_rush" checked={speed === 'no_rush'} onChange={() => setSpeed('no_rush')} label={noRush.label} sub={noRush.sub} />
      ) : null}
    </fieldset>
  );
}
