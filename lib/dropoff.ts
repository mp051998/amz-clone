/**
 * Drop-off spot: where the courier leaves a package at an address when nobody's there to take it,
 * as Amazon asks in an address's delivery instructions ("Where should we leave your packages at
 * this address?"). None means no preference: it's handed over, or left where the courier sees fit.
 */
export const DROPOFF_SPOTS = ['front_door', 'back_door', 'side_porch', 'garage', 'mailroom', 'reception', 'property_staff'] as const;

export type DropoffSpot = (typeof DROPOFF_SPOTS)[number];

export const DROPOFF: Record<DropoffSpot, { label: string; left: string }> = {
  front_door: { label: 'Front door', left: 'Left at the front door' },
  back_door: { label: 'Back door', left: 'Left at the back door' },
  side_porch: { label: 'Side porch', left: 'Left on the side porch' },
  garage: { label: 'Garage', left: 'Left in the garage' },
  mailroom: { label: 'Mailroom', left: 'Left in the mailroom' },
  reception: { label: 'Building reception', left: 'Left with building reception' },
  property_staff: { label: 'Property staff', left: 'Handed to property staff' },
};

export function isDropoffSpot(v: unknown): v is DropoffSpot {
  return typeof v === 'string' && (DROPOFF_SPOTS as readonly string[]).includes(v);
}

/** A spot as a form or API client sends it: `undefined` for blank or none, `null` for anything unknown. */
export function readDropoff(v: unknown): DropoffSpot | undefined | null {
  if (v === undefined || v === null || v === '' || v === 'none') return undefined;
  return isDropoffSpot(v) ? v : null;
}
