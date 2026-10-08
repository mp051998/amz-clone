import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(secret: string): Buffer {
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`not base32: ${ch}`);
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The 6-digit code an authenticator app shows for `secret` at `at` (RFC 6238: SHA-1, 30-second steps). */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return String(n).padStart(6, '0');
}

/** A 6-digit code that isn't valid for `secret` around now. */
export function wrongCode(secret: string): string {
  const near = new Set([-30_000, 0, 30_000].map((d) => totp(secret, Date.now() + d)));
  return ['000000', '111111', '222222'].find((c) => !near.has(c))!;
}

/**
 * Try `use` with the code for now, then the neighbouring 30-second steps (Auth accepts one step
 * either side, and may not take the same code twice): the first that isn't refused as wrong.
 */
export async function withCode<T>(secret: string, use: (code: string) => Promise<T>, wrong: (err: unknown) => boolean): Promise<T> {
  let last: unknown;
  for (const d of [0, 30_000, -30_000]) {
    try {
      return await use(totp(secret, Date.now() + d));
    } catch (err) {
      if (!wrong(err)) throw err;
      last = err;
    }
  }
  throw last;
}
