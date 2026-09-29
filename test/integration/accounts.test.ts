import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress } from '@/lib/data/addresses';
import { DataError } from '@/lib/data/errors';
import { deleteUser, IN_SHIPPING, newUser, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('address book', () => {
  let me: TestUser;
  let other: TestUser;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Ada Lovelace'), newUser('Grace Hopper')]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  it('creates a profile for every new account', async () => {
    const { data } = await me.db.from('profiles').select('display_name').eq('id', me.id).single();
    expect(data?.display_name).toBe('Ada Lovelace');
  });

  it('the first address becomes the default; exactly one default per store', async () => {
    const a = await createAddress(me.db, 'US', US_SHIPPING);
    expect(a.isDefault).toBe(true);
    const b = await createAddress(me.db, 'US', { ...US_SHIPPING, line1: '2021 7th Ave' }, true);
    expect(b.isDefault).toBe(true);
    let list = await listAddresses(me.db, 'US');
    expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([b.id]);

    await setDefaultAddress(me.db, 'US', a.id);
    list = await listAddresses(me.db, 'US');
    expect(list[0]).toMatchObject({ id: a.id, isDefault: true });

    // deleting the default promotes the next one
    await deleteAddress(me.db, 'US', a.id);
    list = await listAddresses(me.db, 'US');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: b.id, isDefault: true });
  });

  it('validates per store and normalises phone numbers', async () => {
    expect(await code(createAddress(me.db, 'US', { ...US_SHIPPING, postcode: '560034' }))).toBe('invalid_input');
    expect(await code(createAddress(me.db, 'IN', { ...IN_SHIPPING, line2: '' }))).toBe('invalid_input');
    const a = await createAddress(me.db, 'IN', { ...IN_SHIPPING, phone: '+91 98765 43210', addressType: 'office' });
    expect(a).toMatchObject({ phone: '9876543210', kind: 'office', zip: '560034' });
  });

  it('caps each store at five addresses', async () => {
    const existing = (await listAddresses(me.db, 'US')).length;
    for (let i = existing; i < 5; i++) await createAddress(me.db, 'US', { ...US_SHIPPING, line1: `${100 + i} Pine St` });
    expect(await code(createAddress(me.db, 'US', US_SHIPPING))).toBe('address_limit');
  });

  it('addresses are private', async () => {
    const [mine] = await listAddresses(me.db, 'US');
    expect(await listAddresses(other.db, 'US')).toHaveLength(0);
    expect(await code(updateAddress(other.db, 'US', mine.id, US_SHIPPING))).toBe('address_not_found');
    expect(await code(deleteAddress(other.db, 'US', mine.id))).toBe('address_not_found');
  });
});
