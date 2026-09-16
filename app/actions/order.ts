'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { computeTotals, getCartLines, writeCart } from '@/lib/cart';
import { newOrderId, writeOrder, type StoredOrder } from '@/lib/orders';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

/** Place the order: snapshot the cart, persist it, clear the cart, go to confirmation. */
export async function placeOrder(formData: FormData): Promise<void> {
  const store = await getMarketplace();
  const cur = store.currency.code;
  const lines = await getCartLines(cur);
  if (lines.length === 0) redirect(storePath(store, '/cart'));

  const subtotal = lines.reduce((a, l) => a + l.lineTotalMinor, 0);
  const totals = computeTotals(subtotal, store);

  const digits = String(formData.get('card') ?? '').replace(/\D/g, '');
  const order: StoredOrder = {
    id: newOrderId(),
    ts: Date.now(),
    // snapshot the per-unit price already in the store currency
    items: lines.map((l) => ({ id: l.product.id, q: l.qty, p: Math.round(l.lineTotalMinor / l.qty) })),
    cur,
    sub: totals.subtotalMinor,
    ship: totals.shipMinor,
    tax: totals.taxMinor,
    tot: totals.totalMinor,
    name: String(formData.get('fullName') ?? 'Guest').slice(0, 40),
    city: String(formData.get('city') ?? '').slice(0, 30),
    zip: String(formData.get('postcode') ?? '').slice(0, 10),
    last4: digits.slice(-4) || '4242',
  };

  await writeOrder(order);
  await writeCart({});
  revalidatePath('/', 'layout');
  redirect(storePath(store, `/orders/${order.id}?placed=1`));
}
