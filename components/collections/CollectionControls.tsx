'use client';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCollection,
  deleteCollection,
  removeFromCollection,
  renameCollection,
  updateCollectionNote,
} from '@/app/actions/collections';
import { addToCartQuiet } from '@/app/collections/actions';
import { useToast } from '../decision/Toast';
import { Button } from '../primitives/Button';
import { cn } from '../lib/cn';
import { fieldClass } from '../lib/controls';
import { storeHref, type MarketId } from '../lib/store';

type Result = { error?: string; message?: string } | object;

function errorOf(res: Result): { error: string; message?: string } | null {
  return 'error' in res && typeof res.error === 'string' ? { error: res.error, message: 'message' in res ? res.message : undefined } : null;
}

/** Signed-out (session expired) → sign in, then come back here. */
function useSignin(market: MarketId) {
  const router = useRouter();
  return () => {
    const here = `${window.location.pathname}${window.location.search}`;
    router.push(storeHref(market, `/signin?next=${encodeURIComponent(here)}`));
  };
}

/** "+ New collection" → inline name field → createCollection, then select the new list. */
export function NewCollection({ market }: { market: MarketId }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const signin = useSignin(market);
  const { toast } = useToast();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '');
    start(async () => {
      const res = await createCollection(name);
      const err = errorOf(res);
      if (err) {
        if (err.error === 'not_authenticated') return signin();
        setError(err.message ?? (err.error === 'duplicate' ? 'You already have a collection with that name.' : "Couldn't create that collection."));
        return;
      }
      if ('collection' in res) {
        setOpen(false);
        setError(null);
        toast(`Created ${res.collection.name}`);
        router.push(storeHref(market, `/collections?c=${res.collection.id}`));
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-12 rounded-card border border-dashed border-line-3 bg-transparent p-3 text-[14px] text-ink transition-colors hover:border-ink"
      >
        + New collection
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      <label htmlFor="new-collection" className="text-[14px] font-semibold">New collection</label>
      <input
        id="new-collection"
        name="name"
        required
        maxLength={60}
        autoFocus
        placeholder="e.g. Travel setup"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'new-collection-err' : undefined}
        className={cn(fieldClass, error && 'border-bad')}
      />
      {error ? (
        <span id="new-collection-err" className="flex gap-1.5 text-[13px] text-bad"><span aria-hidden>⚠</span>{error}</span>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="dark" size="sm" loading={pending}>Create</Button>
        <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
      </div>
    </form>
  );
}

/** Rename / Delete for shopper-made collections. */
export function CollectionMenu({ id, name, market }: { id: string; name: string; market: MarketId }) {
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const signin = useSignin(market);
  const { toast } = useToast();

  const rename = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = String(new FormData(e.currentTarget).get('name') ?? '');
    start(async () => {
      const res = await renameCollection(id, next);
      const err = errorOf(res);
      if (err) {
        if (err.error === 'not_authenticated') return signin();
        setError(err.message ?? (err.error === 'duplicate' ? 'You already have a collection with that name.' : "Couldn't rename it."));
        return;
      }
      setRenaming(false);
      setError(null);
      toast('Collection renamed');
      router.refresh();
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete “${name}”? Items in it are removed from this list.`)) return;
    start(async () => {
      const res = await deleteCollection(id);
      const err = errorOf(res);
      if (err) {
        if (err.error === 'not_authenticated') return signin();
        toast("Couldn't delete that collection");
        return;
      }
      toast(`Deleted ${name}`);
      router.push(storeHref(market, '/collections'));
    });
  };

  if (renaming) {
    return (
      <form onSubmit={rename} className="flex w-full flex-wrap items-start gap-2">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label htmlFor="rename-collection" className="sr-only">Collection name</label>
          <input id="rename-collection" name="name" defaultValue={name} required maxLength={60} autoFocus className={cn(fieldClass, error && 'border-bad')} aria-invalid={error ? true : undefined} />
          {error ? <span className="flex gap-1.5 text-[13px] text-bad"><span aria-hidden>⚠</span>{error}</span> : null}
        </div>
        <Button type="submit" variant="dark" loading={pending}>Save</Button>
        <Button variant="secondary" onClick={() => { setRenaming(false); setError(null); }}>Cancel</Button>
      </form>
    );
  }
  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={() => setRenaming(true)} disabled={pending}>Rename</Button>
      <Button variant="secondary" size="sm" onClick={remove} disabled={pending}>Delete</Button>
    </div>
  );
}

/** Add to cart (accent, stays on the page) + Remove from this collection. */
export function ItemActions({ collectionId, collectionName, productId, productName, inStock, unavailable = false, market }: {
  collectionId: string;
  collectionName: string;
  productId: string;
  productName: string;
  inStock: boolean;
  /** archived: can't be bought any more, only removed. */
  unavailable?: boolean;
  market: MarketId;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const signin = useSignin(market);
  const { toast } = useToast();

  const add = () =>
    start(async () => {
      const res = await addToCartQuiet(productId);
      if ('error' in res) {
        toast(res.message ?? "Couldn't add that to your cart");
        return;
      }
      toast('Added to cart');
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      const res = await removeFromCollection(collectionId, productId);
      const err = errorOf(res);
      if (err) {
        if (err.error === 'not_authenticated') return signin();
        toast("Couldn't remove that — try again");
        return;
      }
      toast(`Removed from ${collectionName}`);
      router.refresh();
    });

  return (
    <div className="flex flex-none gap-2">
      <Button variant="primary" onClick={add} disabled={pending || !inStock || unavailable} aria-label={`Add ${productName} to cart`}>
        {unavailable ? 'Unavailable' : inStock ? 'Add to cart' : 'Out of stock'}
      </Button>
      <Button variant="secondary" onClick={remove} disabled={pending} aria-label={`Remove ${productName} from ${collectionName}`}>
        Remove
      </Button>
    </div>
  );
}

const NOTE_DEBOUNCE_MS = 900;

/** Notes textarea: saves on pause (debounced) and on blur; toasts "Note saved". */
export function CollectionNote({ id, note, market }: { id: string; note: string; market: MarketId }) {
  const [value, setValue] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signin = useSignin(market);
  const { toast } = useToast();

  // switching collections resets the field; a server refresh (after our own save) must not clobber
  // what the shopper is still typing
  const shownId = useRef(id);
  useEffect(() => {
    if (shownId.current !== id) {
      shownId.current = id;
      setValue(note);
      saved.current = note;
    }
  }, [id, note]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = async (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (text.trim() === saved.current.trim()) return;
    const res = await updateCollectionNote(id, text);
    const err = errorOf(res);
    if (err) {
      if (err.error === 'not_authenticated') return signin();
      setError(err.message ?? "Couldn't save the note.");
      return;
    }
    saved.current = text;
    setError(null);
    toast('Note saved');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`note-${id}`} className="text-[14px] font-semibold">Notes</label>
      <textarea
        id={`note-${id}`}
        value={value}
        rows={3}
        maxLength={500}
        placeholder="e.g. Needs to fit under a helmet"
        onChange={(e) => {
          const text = e.target.value;
          setValue(text);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(text), NOTE_DEBOUNCE_MS);
        }}
        onBlur={() => void save(value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `note-${id}-err` : `note-${id}-hint`}
        className={cn(
          'min-h-[88px] w-full resize-y rounded-input border border-line-3 bg-surface p-3 text-[15px] text-ink outline-none placeholder:text-ink-4 hover:border-ink-3 focus:border-ink',
          error && 'border-bad',
        )}
      />
      {error ? (
        <span id={`note-${id}-err`} className="flex gap-1.5 text-[13px] text-bad"><span aria-hidden>⚠</span>{error}</span>
      ) : (
        <span id={`note-${id}-hint`} className="text-[13px] text-ink-3">Saved automatically. Only you can see it.</span>
      )}
    </div>
  );
}
