import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { AddressFields } from '@/components/checkout/AddressFields';
import { readUser } from '@/lib/auth';
import { readAddresses, type Address } from '@/lib/addresses';
import { saveAddress, deleteAddress, setDefaultAddress } from '@/app/actions/address';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Your Addresses | Amazon' };

/** one saved address, with Default badge and Edit / Remove / Set-as-default controls. */
function AddressCard({ a, sp }: { a: Address; sp: (p: string) => string }) {
  const parts = [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.zip}`].filter(Boolean);
  return (
    <div className="flex flex-col rounded-[8px] border border-line bg-white p-4">
      {a.isDefault ? (
        <span className="mb-2 flex items-center gap-1 border-b border-line-3 pb-2 text-[12px] font-bold text-ink-2">
          <span aria-hidden>✔</span> Default address
        </span>
      ) : null}
      <p className="text-[15px] font-bold text-ink">{a.name}</p>
      <div className="mt-1 flex-1 text-[13px] leading-5 text-ink-2">
        {parts.map((p) => <p key={p}>{p}</p>)}
        <p className="mt-1">Phone: {a.phone}</p>
        {a.kind ? <p className="mt-1 capitalize">{a.kind}</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line-3 pt-2 text-[13px]">
        <a href={sp(`/account/addresses?edit=${a.id}`)} className="text-link hover:text-link-hover hover:underline">Edit</a>
        <span className="text-line-2">|</span>
        <form action={deleteAddress}>
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="text-link hover:text-link-hover hover:underline">Remove</button>
        </form>
        {a.isDefault ? null : (
          <>
            <span className="text-line-2">|</span>
            <form action={setDefaultAddress}>
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className="text-link hover:text-link-hover hover:underline">Set as default</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const store = await getMarketplace();
  const sp = (p: string) => storePath(store, p);
  const user = await readUser();
  if (!user) redirect('/signin?next=/account/addresses');

  const addresses = await readAddresses();
  const { edit } = await searchParams;
  const editing = edit ? addresses.find((a) => a.id === edit) : undefined;
  const isIN = store.id === 'IN';

  return (
    <AppShell>
      <div className="mx-auto max-w-[1000px] px-4 py-5">
        <nav className="text-[13px] text-ink-2">
          <a href={sp('/account')} className="text-link hover:text-link-hover hover:underline">Your Account</a>
          <span className="px-1.5">›</span>
          <span className="text-ink">Your Addresses</span>
        </nav>
        <h1 className="mt-2 text-[28px] font-normal text-ink">Your Addresses</h1>

        {addresses.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {addresses.map((a) => <AddressCard key={a.id} a={a} sp={sp} />)}
          </div>
        ) : (
          <p className="mt-5 text-[14px] text-ink-2">You have no saved addresses. Add one below to speed up checkout.</p>
        )}

        {/* add / edit form */}
        <section id="form" className="mt-8 max-w-[600px] rounded-[8px] border border-line bg-white p-5">
          <h2 className="mb-3 text-[18px] font-bold text-ink">{editing ? 'Edit address' : 'Add a new address'}</h2>
          <form action={saveAddress} className="space-y-4">
            <input type="hidden" name="schema" value={store.address.schema} />
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <AddressFields isIN={isIN} address={editing} />
            {editing?.isDefault ? null : (
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" name="makeDefault" defaultChecked={addresses.length === 0} />
                Make this my default address
              </label>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" className="h-[33px] rounded-pill bg-cta-yellow px-6 text-[14px] text-ink shadow-input hover:bg-cta-yellow-hover">
                {editing ? 'Save changes' : 'Add address'}
              </button>
              {editing ? (
                <a href={sp('/account/addresses')} className="text-[13px] text-link hover:text-link-hover hover:underline">Cancel</a>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
