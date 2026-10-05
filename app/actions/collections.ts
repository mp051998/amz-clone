'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';
import { readUser } from '@/lib/auth';
import { readGuestToken, getMarket } from '@/lib/session';
import * as collections from '@/lib/data/collections';
import * as cart from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import type { Collection, CollectionItem } from '@/lib/decision/types';

/**
 * Collections ("Things I'm Considering", "Saved for later", custom lists).
 * Every action returns `{ error: 'not_authenticated' }` for signed-out callers
 * and `{ error: <code>, message }` for data errors (codes in docs/API.md).
 */

export type ActionError = { error: string; message?: string };
export type ToggleSaveResult = { saved: boolean; collectionName: string } | { error: 'not_authenticated' };

async function run<T>(fn: (client: Awaited<ReturnType<typeof db>>) => Promise<T>): Promise<T | ActionError> {
  const user = await readUser();
  if (!user) return { error: 'not_authenticated' };
  try {
    return await fn(await db());
  } catch (err) {
    if (err instanceof DataError) return { error: err.code, message: err.message };
    throw err;
  }
}

function revalidate() {
  revalidatePath('/', 'layout');
}

/**
 * Save button: saves to "Things I'm Considering", or un-saves from every list.
 * Throws on data errors (e.g. a product from another store) — the button reverts.
 */
export async function toggleSave(productId: string): Promise<ToggleSaveResult> {
  const user = await readUser();
  if (!user) return { error: 'not_authenticated' };
  const res = await collections.toggleSaved(await db(), await getMarket(), String(productId));
  revalidate();
  return { saved: res.saved, collectionName: res.collectionName ?? '' };
}

export async function createCollection(name: string, note?: string): Promise<{ collection: Collection } | ActionError> {
  return run(async (client) => {
    const collection = await collections.createCollection(client, await getMarket(), { name, note });
    revalidate();
    return { collection };
  });
}

export async function renameCollection(id: string, name: string): Promise<{ collection: Collection } | ActionError> {
  return run(async (client) => {
    const collection = await collections.updateCollection(client, id, { name });
    revalidate();
    return { collection };
  });
}

export async function updateCollectionNote(id: string, note: string): Promise<{ collection: Collection } | ActionError> {
  return run(async (client) => {
    const collection = await collections.updateCollection(client, id, { note });
    revalidate();
    return { collection };
  });
}

export async function deleteCollection(id: string): Promise<{ ok: true } | ActionError> {
  return run(async (client) => {
    await collections.deleteCollection(client, id);
    revalidate();
    return { ok: true as const };
  });
}

export async function addToCollection(collectionId: string, productId: string): Promise<{ item: CollectionItem } | ActionError> {
  return run(async (client) => {
    const item = await collections.addItem(client, collectionId, productId);
    revalidate();
    return { item };
  });
}

export async function removeFromCollection(collectionId: string, productId: string): Promise<{ ok: true } | ActionError> {
  return run(async (client) => {
    await collections.removeItem(client, collectionId, productId);
    revalidate();
    return { ok: true as const };
  });
}

/** Cart "Save for later": adds to "Saved for later", then removes the cart line. */
export async function moveCartItemToSaved(productId: string): Promise<{ collectionName: string } | ActionError> {
  return run(async (client) => {
    const market = await getMarket();
    const target = await collections.ensureSystemCollection(client, market, 'later');
    await collections.addItem(client, target.id, String(productId));
    await cart.setCartQty(client, market, String(productId), 0, await readGuestToken());
    revalidate();
    return { collectionName: target.name };
  });
}

/**
 * Cart "Saved for later" → "Move to cart": one into the cart, then off the list. A product that
 * can't go in (sold out, gone) stays saved and the error comes back.
 */
export async function moveSavedToCart(collectionId: string, productId: string): Promise<{ ok: true } | ActionError> {
  return run(async (client) => {
    const market = await getMarket();
    await cart.addToCart(client, market, String(productId), 1, null);
    await collections.removeItem(client, String(collectionId), String(productId));
    revalidate();
    return { ok: true as const };
  });
}
