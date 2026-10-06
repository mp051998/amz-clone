/**
 * Browser-side checks for the address form, mirroring the server's address contract
 * (lib/contracts.ts, after lib/data/addresses.ts normalises the phone) so a typo is
 * caught before submit instead of round-tripping and clearing what was typed.
 *
 * Each `pattern` is an HTML pattern attribute: the browser anchors it and compiles it
 * with the `v` flag. `title` is the server's message, shown in the browser's bubble.
 */
export interface FieldCheck {
  pattern: string;
  title: string;
}

const filled = (title: string): FieldCheck => ({ pattern: '.*\\S.*', title });

const US = {
  fullName: filled('Enter a name'),
  // any separators, optional leading 1, then 10 digits
  phone: { pattern: '\\D*(1\\D*)?(\\d\\D*){10}', title: 'Enter a 10-digit phone number' },
  line1: filled('Enter an address'),
  city: filled('Enter a city'),
  state: { pattern: '\\s*[A-Za-z]{2}\\s*', title: 'Use the 2-letter state code' },
  postcode: { pattern: '\\s*\\d{5}(-\\d{4})?\\s*', title: 'Enter a valid ZIP Code' },
} satisfies Record<string, FieldCheck>;

const IN = {
  fullName: filled('Enter a name'),
  // any separators, optional leading 91, then 10 digits starting 6-9
  phone: { pattern: '\\D*(9\\D*1\\D*)?[6-9]\\D*(\\d\\D*){9}', title: 'Indian mobile: 10 digits starting 6-9' },
  line1: filled('Enter an address'),
  line2: filled('Enter an area/street'),
  city: filled('Enter a city'),
  state: filled('Enter a state'),
  postcode: { pattern: '\\s*[1-9]\\d{5}\\s*', title: 'Enter a valid Pincode' },
} satisfies Record<string, FieldCheck>;

export type AddressChecks = Partial<Record<'fullName' | 'phone' | 'line1' | 'line2' | 'city' | 'state' | 'postcode', FieldCheck>>;

export function addressChecks(isIN: boolean): AddressChecks {
  return isIN ? IN : US;
}
