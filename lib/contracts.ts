import { z } from 'zod';
import { DROPOFF_SPOTS } from './dropoff';

/** Currency the store prices in. This clone is amazon.com (US), so USD. */
export type CurrencyCode = 'USD' | 'INR';

/** Longest delivery note an address carries (the database checks the same). */
export const INSTRUCTIONS_MAX = 250;
const instructions = z.string().trim().max(INSTRUCTIONS_MAX, `Keep delivery instructions under ${INSTRUCTIONS_MAX} characters`).optional();
/** where to leave packages at the address (none: no preference) */
const dropoff = z.enum(DROPOFF_SPOTS, { message: 'Choose where to leave packages from the list' }).optional();

// Address input, validated as a discriminated union on `schema`.
const UsAddressSchema = z.object({
  schema: z.literal('US'),
  fullName: z.string().trim().min(1, 'Enter a name'),
  phone: z.string().trim().regex(/^\d{10}$/, 'Enter a 10-digit phone number'),
  line1: z.string().trim().min(1, 'Enter an address'),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1, 'Enter a city'),
  state: z.string().trim().length(2, 'Use the 2-letter state code'),
  postcode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP Code'),
  instructions,
  dropoff,
});
const InAddressSchema = z.object({
  schema: z.literal('IN'),
  fullName: z.string().trim().min(1, 'Enter a name'),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Indian mobile: 10 digits starting 6-9'),
  line1: z.string().trim().min(1, 'Enter an address'),
  line2: z.string().trim().min(1, 'Enter an area/street'),
  landmark: z.string().trim().optional(),
  city: z.string().trim().min(1, 'Enter a city'),
  state: z.string().trim().min(1, 'Enter a state'),
  postcode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid Pincode'),
  addressType: z.enum(['home', 'office']).optional(),
  instructions,
  dropoff,
});

export const AddressInputSchema = z.discriminatedUnion('schema', [UsAddressSchema, InAddressSchema]);
export type AddressInput = z.infer<typeof AddressInputSchema>;

export interface HomeCampaign {
  id: string;
  title: string;
  cta?: string;
  href: string;
  image: string;
  alt: string;
}

export type HomeModule =
  | { kind: 'campaign'; id: string; campaign: HomeCampaign }
  | { kind: 'merchandising-grid'; id: string; cardIds: readonly string[] }
  | { kind: 'deal-rail'; id: string; title: string; productIds: readonly string[] };

export interface MarketplaceUi {
  navPromotion?: { label: string; href: string };
  home: readonly HomeModule[];
}

/** The projection every UI component renders from. */
export interface PublicMarketplace {
  id: 'US' | 'IN';
  name: string;
  hostname: string;
  country: 'US' | 'IN';
  locale: { default: string; supported: string[] };
  currency: { code: CurrencyCode; symbol: string; display: CurrencyCode[]; fractionDigits: number; grouping: 'western' | 'indian' };
  dates: { order: 'MDY' | 'DMY'; timeZone: string };
  pricing: { taxInclusive: boolean; listLabel: string; savingsFirst: boolean; taxNote?: string };
  address: { schema: 'US' | 'IN'; postcode: { label: string; pattern: string }; types?: Array<'home' | 'office'> };
  payments: { method: string; phase: number }[];
  delivery: { methods: string[]; freeThresholdMinor: number };
  /**
   * days after delivery a shopper can start a return (markets.return_days in the database), and
   * the Renewed Guarantee's days for an item bought renewed (markets.renewed_return_days; absent:
   * no guarantee, the category's window).
   */
  returns: { days: number; renewedDays?: number };
  membership: { name: string };
  nav: { subnav: string[]; departments: string[] };
  ui: MarketplaceUi;
  features: Record<string, boolean>;
}
