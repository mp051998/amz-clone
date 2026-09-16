import { headers } from 'next/headers';
import type { PublicMarketplace } from './contracts';
import { amazon } from './amazon';
import { amazonIn } from './marketplace-in';

/**
 * Active store for this request. `middleware.ts` rewrites /in/* onto the base routes and
 * stamps `x-amz-country: IN`; everything else is the US store. Works in server components
 * AND server actions — both see the rewritten request headers.
 */
export async function getMarketplace(): Promise<PublicMarketplace> {
  const country = (await headers()).get('x-amz-country');
  return country === 'IN' ? amazonIn : amazon;
}
