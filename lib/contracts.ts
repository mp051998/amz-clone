import { z } from 'zod';

/** Currency the store prices in. This clone is amazon.com (US), so USD. */
export type CurrencyCode = 'USD' | 'INR';

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
  membership: { name: string };
  nav: { subnav: string[]; departments: string[] };
  ui: MarketplaceUi;
  features: Record<string, boolean>;
}
