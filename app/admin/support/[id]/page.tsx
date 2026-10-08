import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { fieldClass } from '@/components/lib/controls';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { CaseStatus, CaseThread } from '@/components/support/CaseThread';
import { messageFor } from '@/lib/data/errors';
import { getCase, MESSAGE_MAX, TOPIC_LABELS } from '@/lib/data/support';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminTime } from '../../orders/labels';
import { adminPage } from '../../guard';
import { AdminFrame, AdminOnly } from '../../ui';
import { closeAsStoreAction, replyAsStoreAction } from '../actions';

export const metadata: Metadata = { title: 'Support case · Admin · Store' };

const DONE: Record<string, string> = { replied: 'Reply sent. The case is answered until the shopper replies.', closed: 'Case closed.' };
const ERROR: Record<string, string> = { invalid_reply: 'Write a reply of 2 to 2,000 characters.' };

/** /admin/support/:id: one case in this store, its messages, and Reply / Close as the store. */
export default async function AdminSupportCasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const [{ id }, { done, error }] = await Promise.all([params, searchParams]);
  const { store, admin } = await adminPage(`/admin/support/${id}`);
  if (!admin) return <AdminOnly store={store} />;
  const thread = await getCase(await db(), store.id, id, null);
  if (!thread) notFound();
  const to = (path: string) => storePath(store, path);
  const closed = thread.status === 'closed';

  return (
    <AdminFrame
      store={store}
      path="/admin/support"
      title={thread.subject}
      lede={
        <span className="flex flex-wrap items-center gap-2">
          <CaseStatus status={thread.status} viewer="agent" />
          <span>
            {thread.customer || 'Customer'} · {TOPIC_LABELS[thread.topic]}
            {thread.seller ? <> · For seller <span className="font-semibold text-ink">{thread.seller}</span></> : null} · Opened {adminTime(thread.createdAt, store)}
          </span>
          {thread.orderId ? (
            <a href={to(`/admin/orders/${encodeURIComponent(thread.orderId)}`)} className="text-ink underline underline-offset-2">
              Order <span className="font-mono">{thread.orderId}</span>
            </a>
          ) : null}
        </span>
      }
    >
      <a href={to('/admin/support')} className="self-start text-[14px] text-ink underline underline-offset-2">← All cases</a>
      {done && DONE[done] ? <Alert tone="success">{DONE[done]}</Alert> : null}
      {error ? <Alert tone="error">{ERROR[error] ?? messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}

      <div className="flex max-w-[760px] flex-col gap-5">
        <CaseThread messages={thread.messages} viewer="agent" customer={thread.customer} seller={thread.seller} time={(iso) => adminTime(iso, store)} />
        {closed ? (
          <p className="m-0 text-[15px] text-ink-2">Closed{thread.closedAt ? ` ${adminTime(thread.closedAt, store)}` : ''}. Nobody can reply on it now.</p>
        ) : (
          <>
            <form action={replyAsStoreAction.bind(null, thread.id)} className="flex flex-col gap-2">
              <label htmlFor="cs-reply" className="text-[14px] font-semibold">{thread.seller ? `Reply as ${thread.seller}` : 'Reply as the store'}</label>
              <textarea id="cs-reply" name="body" required minLength={2} maxLength={MESSAGE_MAX} rows={5} className={`${fieldClass} h-auto py-2.5 leading-normal`} />
              <button type="submit" className={`${buttonClasses({ variant: 'primary', size: 'sm' })} self-start`}>Send reply</button>
            </form>
            <div className="border-t border-line-2 pt-4">
              <ConfirmAction
                action={closeAsStoreAction.bind(null, thread.id)}
                label="Close case"
                prompt={<>Close this case? Neither of you can reply on it after.</>}
                confirmLabel="Yes, close it"
                pendingLabel="Closing…"
              />
            </div>
          </>
        )}
      </div>
    </AdminFrame>
  );
}
