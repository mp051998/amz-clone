import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setProviderOverride } from '@/lib/ai';
import { deleteUser, newUser, type TestUser } from './helpers';

describe('search by image', () => {
  let shopper: TestUser;
  beforeAll(async () => {
    setProviderOverride(null);
    shopper = await newUser('Lens Shopper');
  });
  afterAll(async () => {
    setProviderOverride(undefined);
    await deleteUser(shopper);
  });

  it('is served at POST /searches/image', async () => {
    const { POST } = await import('@/app/api/v1/searches/image/route');
    // a bearer token: the cookie client needs a Next request scope
    const token = (await shopper.db.auth.getSession()).data.session!.access_token;
    const post = (body: unknown) =>
      POST(
        new NextRequest('http://localhost/api/v1/searches/image', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({}) },
      );
    const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
    // no AI here: the file's name is all there is to go on
    const named = await post({ image, name: 'walnut-desk-organizer.jpg' });
    expect(named.status).toBe(200);
    expect(await named.json()).toEqual({ query: 'walnut desk organizer', source: 'rules' });
    expect(await (await post({ image, name: 'IMG_0042.jpg' })).json()).toEqual({ query: null, source: 'rules' });
    const bad = await post({ image: 'not a photo', mimeType: 'image/jpeg' });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ error: { code: 'invalid_input', detail: 'image' } });
  });
});
