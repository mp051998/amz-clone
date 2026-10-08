'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DataError } from '@/lib/data/errors';
import { receiveTradeIn, rejectTradeIn, tradeInFilter } from '@/lib/data/trade-ins';
import { isExchangeCondition } from '@/lib/exchange';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { adminClient } from '../guard';

const MOVES = ['receive', 'reject'] as const;
type Move = (typeof MOVES)[number];

/**
 * One admin move on a trade-in (bound to its id, the move and the queue filter the admin was on;
 * all checked here since a client can send anything). Receive reads the condition it came in from
 * the form, reject its note. Back to the same queue with a notice or the error.
 */
export async function tradeInAction(id: string, move: string, from: string, formData?: FormData): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => {
    const f = tradeInFilter(from);
    return storePath(store, `/admin/trade-ins?${f === 'open' ? '' : `filter=${f}&`}${qs}`);
  };
  if (typeof id !== 'string' || !(MOVES as readonly string[]).includes(move)) redirect(back('error=trade_in_not_found'));
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code: string | null = null;
  let done: string = move;
  try {
    if ((move as Move) === 'receive') {
      const condition = formData?.get('condition');
      if (!isExchangeCondition(condition)) throw new DataError('invalid_input', 'condition');
      const t = await receiveTradeIn(client, store.id, id, condition);
      // paid less than the quote: it came in worse than the shopper said
      if ((t.creditedMinor ?? 0) < t.quoteMinor) done = 'receive_less';
    } else await rejectTradeIn(client, store.id, id, formData?.get('note'));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  revalidatePath('/', 'layout');
  redirect(back(code ? `error=${encodeURIComponent(code)}` : `done=${done}`));
}
