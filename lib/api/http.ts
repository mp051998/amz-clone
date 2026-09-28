import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type { Database } from '../db/database.types';
import type { Db } from '../db/client';
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from '../supabase/config';
import { createClient as createCookieClient } from '../supabase/server';
import { isToken } from '../session';
import { DataError } from '../data/errors';
import type { Market } from '../types';

/**
 * Plumbing shared by every /api/v1 route: who is calling, which store, the
 * guest cart token, JSON in/out, and one error shape.
 *
 * Auth: `Authorization: Bearer <access token>` (from POST /api/v1/auth/token),
 * or the web app's Supabase session cookie. Either way the database sees the
 * caller's JWT, so row-level security applies to API calls exactly as it does to
 * pages. Store: `?market=US|IN` (or `X-Market`), default US. Guest carts:
 * `X-Cart-Token: <uuid>`; the first guest write mints one and returns it in the
 * `X-Cart-Token` response header.
 */

export interface ApiUser {
  id: string;
  email: string | null;
}

export interface ApiContext {
  req: NextRequest;
  db: Db;
  market: Market;
  user: ApiUser | null;
  /** guest cart token from X-Cart-Token (null when absent or malformed) */
  cartToken: string | null;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Cart-Token, X-Market',
  'Access-Control-Expose-Headers': 'X-Cart-Token',
  'Access-Control-Max-Age': '86400',
};

export function json(body: unknown, init: ResponseInit & { cartToken?: string | null } = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set('Cache-Control', 'no-store');
  if (init.cartToken) headers.set('X-Cart-Token', init.cartToken);
  return Response.json(body, { status: init.status ?? 200, headers });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof DataError) {
    const status = err.status === 500 ? 500 : err.status;
    if (status >= 500) console.error('[api]', err.code, err.detail ?? '');
    return json(
      { error: { code: err.code, message: err.message, ...(err.detail && status < 500 ? { detail: err.detail } : {}) } },
      { status },
    );
  }
  console.error('[api] unhandled', err);
  return json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, { status: 500 });
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization');
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Supabase client acting as the caller (their JWT) — or anonymous. */
async function clientFor(req: NextRequest): Promise<{ db: Db; user: ApiUser | null }> {
  assertSupabaseEnv();
  const token = bearer(req);
  if (token) {
    const db = createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new DataError('not_authenticated', undefined, 'Invalid or expired access token.');
    return { db, user: { id: data.user.id, email: data.user.email ?? null } };
  }
  const db = await createCookieClient();
  const { data } = await db.auth.getUser();
  return { db, user: data.user ? { id: data.user.id, email: data.user.email ?? null } : null };
}

function marketOf(req: NextRequest): Market {
  const raw = (req.nextUrl.searchParams.get('market') ?? req.headers.get('x-market') ?? 'US').toUpperCase();
  if (raw !== 'US' && raw !== 'IN') throw new DataError('unknown_market', raw);
  return raw;
}

export async function context(req: NextRequest): Promise<ApiContext> {
  const market = marketOf(req);
  const { db, user } = await clientFor(req);
  const raw = req.headers.get('x-cart-token');
  return { req, db, market, user, cartToken: isToken(raw) ? raw : null };
}

export function requireUser(ctx: ApiContext): ApiUser {
  if (!ctx.user) throw new DataError('not_authenticated');
  return ctx.user;
}

/** Parse a JSON object body (empty body → {}). */
export async function body(req: NextRequest): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text.trim()) return {};
  const type = req.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(type)) throw new DataError('unsupported_media_type');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataError('invalid_json');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new DataError('invalid_json');
  return parsed as Record<string, unknown>;
}

export function intParam(v: string | null, fallback: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

type Params = Record<string, string | string[]>;
export type RouteCtx<P extends Params = Params> = { params: Promise<P> };

/** Wrap a handler: builds the context, awaits params, and turns any error into the JSON error shape. */
export function route<P extends Params = Params>(
  fn: (ctx: ApiContext, params: P) => Promise<Response>,
): (req: NextRequest, rc: RouteCtx<P>) => Promise<Response> {
  return async (req, rc) => {
    try {
      const [ctx, params] = await Promise.all([context(req), rc?.params ?? Promise.resolve({} as P)]);
      return await fn(ctx, params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
