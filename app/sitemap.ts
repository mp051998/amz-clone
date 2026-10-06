import type { MetadataRoute } from 'next';
import { listCategories, listProducts } from '@/lib/data/catalog';
import { siteOrigin } from '@/lib/origin';
import { sitemapEntries, type StoreCatalog } from '@/lib/seo';
import { db } from '@/lib/supabase/server';
import type { Market } from '@/lib/types';

/** Both stores' public pages, departments and every product on sale (each option of a variant group has its own page). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const client = await db();
  const store = async (m: Market): Promise<StoreCatalog> => {
    const [categories, products] = await Promise.all([listCategories(client, m), listProducts(client, m, { allVariants: true })]);
    return { categories, products };
  };
  const [US, IN] = await Promise.all([store('US'), store('IN')]);
  return sitemapEntries(await siteOrigin(), { US, IN });
}
