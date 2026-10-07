'use server';
import { redirect } from 'next/navigation';
import { DataError } from '@/lib/data/errors';
import { assertStoreReport, productReportView, resolveProductReport } from '@/lib/data/product-reports';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { adminClient } from '../guard';

/**
 * Resolve or dismiss one report (status and note from the form), bound to its id and the view the
 * admin was on (all checked here, since a client can send anything), then back to that view.
 */
export async function resolveReportAction(id: string, view: string, form: FormData): Promise<void> {
  const store = await getMarketplace();
  const back = (qs: string) => {
    const v = productReportView(view);
    return storePath(store, `/admin/product-reports?${v === 'open' ? '' : `view=${v}&`}${qs}`);
  };
  if (typeof id !== 'string') redirect(back('error=report_not_found'));
  const status = form.get('status');
  const { client, error } = await adminClient();
  if (error) redirect(back('error=forbidden'));
  let code: string | null = null;
  try {
    await assertStoreReport(client, store.id, id);
    await resolveProductReport(client, id, status, form.get('note'));
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    code = err.code;
  }
  redirect(back(code ? `error=${encodeURIComponent(code)}` : `done=${status === 'dismissed' ? 'dismissed' : 'resolved'}`));
}
