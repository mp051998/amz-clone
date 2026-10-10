import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { Checkbox } from '@/components/primitives/Checkbox';
import { AddressFields } from '@/components/checkout/AddressFields';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listAddresses } from '@/lib/data/addresses';
import { DROPOFF } from '@/lib/dropoff';
import { messageFor } from '@/lib/data/errors';
import type { Address } from '@/lib/types';
import { saveAddress, deleteAddress, setDefaultAddress } from '@/app/actions/address';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export const metadata: Metadata = { title: 'Addresses · Store' };

const textBtn = 'min-h-11 px-1 text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink';

/** one saved address, with Default chip and Edit / Remove / Set-as-default controls. */
function AddressCard({ a, sp }: { a: Address; sp: (p: string) => string }) {
  const parts = [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean);
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line bg-surface p-[18px]">
      <div className="flex items-start justify-between gap-2">
        <strong className="text-[16px] font-semibold">{a.name}</strong>
        {a.isDefault ? <span className="flex-none rounded-chip bg-ink px-2 py-1 text-[12px] font-semibold text-on-ink">Default</span> : null}
      </div>
      <div className="flex-1 text-[14px] leading-[1.5] text-ink-2">
        {parts.map((p) => <p key={p} className="m-0">{p}</p>)}
        <p className="m-0 mt-1">Phone {a.phone}{a.kind ? ` · ${a.kind === 'office' ? 'Office' : 'Home'}` : ''}</p>
        {a.dropoff ? <p className="m-0 mt-1"><span className="font-semibold text-ink">Leave packages at:</span> {DROPOFF[a.dropoff].label}</p> : null}
        {a.instructions ? <p className="m-0 mt-1 whitespace-pre-line"><span className="font-semibold text-ink">Delivery instructions:</span> {a.instructions}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line-2 pt-1">
        <a href={sp(`/account/addresses?edit=${a.id}#form`)} className={textBtn} aria-label={`Edit address for ${a.name}`}>Edit</a>
        <form action={deleteAddress}>
          <input type="hidden" name="id" value={a.id} />
          <SubmitButton bare className={textBtn} aria-label={`Remove address for ${a.name}`}>Remove</SubmitButton>
        </form>
        {a.isDefault ? null : (
          <form action={setDefaultAddress}>
            <input type="hidden" name="id" value={a.id} />
            <SubmitButton bare className={textBtn}>Set as default</SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; error?: string; msg?: string }>;
}) {
  const store = await getMarketplace();
  const sp = (p: string) => storePath(store, p);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account/addresses'));

  const addresses = await listAddresses(await db(), store.id);
  const { edit, error, msg } = await searchParams;
  const problem = error ? (error === 'invalid_input' && msg ? msg : messageFor(error) ?? 'Could not save that address.') : null;
  const editing = edit ? addresses.find((a) => a.id === edit) : undefined;
  const isIN = store.id === 'IN';

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Addresses</h1>
          <span className="text-[15px] text-ink-2">Saved {isIN ? 'Indian' : 'US'} delivery addresses — choose one at checkout.</span>
        </div>

        {addresses.length > 0 ? (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5 p-0">
            {addresses.map((a) => <AddressCard key={a.id} a={a} sp={sp} />)}
          </ul>
        ) : (
          <EmptyState title="No saved addresses">Add one below to speed up checkout.</EmptyState>
        )}

        <section id="form" className="flex max-w-[680px] flex-col gap-3.5 rounded-card border border-line bg-surface p-[18px]" aria-labelledby="form-h">
          <h2 id="form-h" className="m-0 text-[20px] font-semibold">{editing ? 'Edit address' : 'Add a new address'}</h2>
          {problem ? <Alert tone="error">{problem}</Alert> : null}
          <form action={saveAddress} className="flex flex-col gap-4">
            <input type="hidden" name="schema" value={store.address.schema} />
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <AddressFields isIN={isIN} address={editing} />
            {editing?.isDefault ? null : (
              <Checkbox name="makeDefault" label="Make this my default address" defaultChecked={addresses.length === 0} />
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <SubmitButton variant="primary">{editing ? 'Save changes' : 'Add address'}</SubmitButton>
              {editing ? <a href={sp('/account/addresses')} className={buttonClasses({ variant: 'secondary' })}>Cancel</a> : null}
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
