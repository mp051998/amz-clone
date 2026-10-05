import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/origin';
import { robotsRules } from '@/lib/seo';

export default async function robots(): Promise<MetadataRoute.Robots> {
  return robotsRules(await siteOrigin());
}
