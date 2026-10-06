import { redirect } from 'next/navigation';
import { readUser } from '@/lib/auth';
import { dataFileName, exportMyData } from '@/lib/data/my-data';
import { storePath } from '@/lib/marketplace';
import { getMarket } from '@/lib/session';
import { db } from '@/lib/supabase/server';

/** Download your data: everything the store keeps about the signed-in shopper, as one JSON file. */
export async function GET(): Promise<Response> {
  const user = await readUser();
  if (!user) redirect(storePath({ id: await getMarket() }, '/signin?next=/account/security'));
  const now = new Date();
  const data = await exportMyData(await db(), user, now);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${dataFileName(now)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
