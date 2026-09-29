import { redirect } from 'next/navigation';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export default async function AdminHome() {
  redirect(storePath(await getMarketplace(), '/admin/products'));
}
