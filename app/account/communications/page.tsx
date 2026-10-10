import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setMessageTopicOn } from '@/app/actions/message-preferences';
import { AppShell } from '@/components/AppShell';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { ALWAYS_SENT, isMessageTopic, mutedTopics, topicStates } from '@/lib/data/message-preferences';
import { storePath } from '@/lib/marketplace';
import { getMarketplace } from '@/lib/marketplace-server';
import { db } from '@/lib/supabase/server';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Communication preferences · Store' };

const PAGE = '/account/communications';

/**
 * /account/communications, Amazon's Communication Preferences Center: turn off the messages that
 * aren't about an order (review requests, answers to your questions, watched deal alerts). Order,
 * refund, return, support, claim and recall messages always come. The account's, in both stores.
 */
export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp(`/signin?next=${PAGE}`));
  const [muted, { saved, error }] = await Promise.all([mutedTopics(await db(), user.id), searchParams]);
  const topics = topicStates(muted);
  const changed = isMessageTopic(saved) ? topics.find((t) => t.id === saved) : undefined;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Communication preferences</h1>
          <span className="text-[15px] text-ink-2">
            Choose which messages you get in <a href={sp('/account/messages')} className="text-ink underline underline-offset-2">Your messages</a>. This applies to your account in every store.
          </span>
        </div>

        {error ? <Alert tone="error">We couldn’t change that. Please try again.</Alert> : null}
        {!error && changed ? (
          <Alert tone="success">
            {changed.label} turned {changed.on ? 'on' : 'off'}.
          </Alert>
        ) : null}

        <section aria-labelledby="topics" className="flex flex-col gap-2">
          <h2 id="topics" className="m-0 text-[18px] font-semibold">Messages you can turn off</h2>
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
            {topics.map((t) => (
              <li key={t.id} aria-label={t.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-2 px-4 py-3.5 first:border-t-0">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{t.label}</span>
                  <span className="text-[14px] text-ink-2">{t.desc}</span>
                  <span className={`text-[13px] ${t.on ? 'text-good-strong' : 'text-ink-3'}`}>{t.on ? 'On' : 'Off'}</span>
                </div>
                <form action={setMessageTopicOn}>
                  <input type="hidden" name="topic" value={t.id} />
                  <input type="hidden" name="on" value={t.on ? '0' : '1'} />
                  <SubmitButton variant={t.on ? 'secondary' : 'primary'} size="sm" aria-label={`Turn ${t.on ? 'off' : 'on'} ${t.label.toLowerCase()}`}>
                    {t.on ? 'Turn off' : 'Turn on'}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          {topics.some((t) => !t.on) ? (
            <span className="text-[13px] text-ink-3">Turned-off messages stop showing in Your messages, including ones already there. Turn them back on to see them again.</span>
          ) : null}
        </section>

        <section aria-labelledby="always" className="flex flex-col gap-2">
          <h2 id="always" className="m-0 text-[18px] font-semibold">Always sent</h2>
          <span className="text-[14px] text-ink-2">These are about your orders, your money and your safety, so they always come.</span>
          <ul className="m-0 flex flex-col gap-1 pl-5 text-[14px] text-ink-2">
            {ALWAYS_SENT.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>

        <a href={sp('/account/messages')} className={`${buttonClasses({ variant: 'secondary' })} self-start`}>
          Your messages
        </a>
      </div>
    </AppShell>
  );
}
