import { selectClass } from '../lib/controls';
import { localDayStart } from '@/lib/decision/tracking';
import type { PickupPoint } from '@/lib/types';
import { dayLabel, longDate, type StoreDates } from './format';

/** Noon on a store-local day ("2026-10-14"), to word it in the store's time zone. */
export function returnDay(ymd: string, store: StoreDates): Date {
  return new Date(Date.parse(localDayStart(ymd, store.dates.timeZone)) + 12 * 3_600_000);
}

/** "Hub Locker – Juniper, 2121 7th Ave, Seattle" */
export function pointText(p: PickupPoint): string {
  return `${p.name}, ${p.line1}, ${p.city}`;
}

/**
 * "How will you send it back?": drop it off (at a chosen Hub Locker or Hub Counter, or any
 * drop-off point) or have a courier collect it from the delivery address on one of `days`.
 * Form fields `method`, `point` and `pickupOn`, for the return form and "Change return method".
 * Without `pickupFrom` (an order collected from a pickup point) it can only be dropped off.
 */
export function ReturnMethodFields({
  idPrefix,
  legend,
  points,
  days,
  pickupFrom,
  store,
  now = new Date(),
  current,
}: {
  idPrefix: string;
  legend: string;
  points: PickupPoint[];
  /** the days a courier can come, "2026-10-14" (none: no pickup) */
  days: string[];
  /** the delivery address it would be collected from (absent: no pickup) */
  pickupFrom?: string;
  store: StoreDates;
  now?: Date;
  current?: { pointId?: string; pickupOn?: string };
}) {
  const canPickup = !!pickupFrom && days.length > 0;
  const pickup = canPickup && !!current?.pickupOn;
  const option = 'flex cursor-pointer items-start gap-2.5 rounded-input border border-line px-3 py-2.5 text-[14px] has-[:checked]:border-ink';
  const radio = 'mt-0.5 h-[18px] w-[18px] shrink-0 accent-ink';
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[14px] font-semibold">{legend}</legend>
      <div className="flex flex-col gap-2">
        <label className={option}>
          <input type="radio" name="method" value="dropoff" defaultChecked={!pickup} className={radio} />
          <span>
            <span className="font-semibold">Drop it off</span>
            <span className="block text-[13px] text-ink-3">At a Hub Counter or Hub Locker, with the return code, by the drop-off deadline.</span>
          </span>
        </label>
        {points.length ? (
          <div className="flex flex-col gap-1 pl-[30px]">
            <label htmlFor={`${idPrefix}-point`} className="text-[13px] text-ink-2">Where</label>
            <select id={`${idPrefix}-point`} name="point" defaultValue={current?.pointId ?? ''} className={`${selectClass} w-full`}>
              <option value="">Any drop-off point</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {pointText(p)} · {p.hours}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {canPickup ? (
          <>
            <label className={option}>
              <input type="radio" name="method" value="pickup" defaultChecked={pickup} className={radio} />
              <span>
                <span className="font-semibold">Have it picked up</span>
                <span className="block text-[13px] text-ink-3">A courier collects it from {pickupFrom}. Have it packed and ready, with the return code.</span>
              </span>
            </label>
            <div className="flex flex-col gap-1 pl-[30px]">
              <label htmlFor={`${idPrefix}-day`} className="text-[13px] text-ink-2">Pickup day</label>
              <select
                id={`${idPrefix}-day`}
                name="pickupOn"
                defaultValue={current?.pickupOn && days.includes(current.pickupOn) ? current.pickupOn : days[0]}
                className={`${selectClass} w-full`}
              >
                {days.map((d) => (
                  <option key={d} value={d}>{dayLabel(returnDay(d, store), store, now)}</option>
                ))}
              </select>
            </div>
          </>
        ) : null}
      </div>
    </fieldset>
  );
}

/** "Tuesday, October 14" for a return's pickup day. */
export function pickupDayText(ymd: string, store: StoreDates): string {
  return longDate(returnDay(ymd, store), store);
}
