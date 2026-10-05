#!/usr/bin/env node
// Downloads a 1000px copy of every seeded product image for the product page zoom and full view.
//
// The catalog builders keep a 400px image per product (public/products/<safeId>.jpg, and
// public/products/in/ for the India store) so cards stay light; this adds the large copy next to
// it under zoom/ (public/products/zoom/<safeId>.jpg, public/products/in/zoom/<safeId>.jpg).
// lib/product-images.ts maps a seeded image path to its zoom copy.
//
// The Amazon image ids come from the RAW lists in scripts/build-catalog.mjs and
// scripts/build-catalog-in.mjs (the file names drop the + and - those ids can carry, so the
// ids can't be read back from public/). Existing files are skipped; rerun after adding products.
//
//   node scripts/fetch-zoom-images.mjs
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 1000;
const STORES = [
  { builder: 'scripts/build-catalog.mjs', dir: 'public/products/zoom' },
  { builder: 'scripts/build-catalog-in.mjs', dir: 'public/products/in/zoom' },
];

const safe = (id) => id.replace(/[^A-Za-z0-9]/g, '');
const cdn = (id) => `https://m.media-amazon.com/images/I/${id}._AC_SL${SIZE}_.jpg`;

/** the first field of each `['<id>', ...]` row of the builder's RAW list */
function rawIds(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const start = src.indexOf('const RAW = [');
  if (start < 0) throw new Error(`${file}: no RAW list`);
  const end = src.indexOf('\n];', start);
  return [...src.slice(start, end).matchAll(/^\s*\['([^']+)'/gm)].map((m) => m[1]);
}

let ok = 0, skip = 0, fail = 0;
const failed = [];
for (const { builder, dir } of STORES) {
  const out = join(ROOT, dir);
  mkdirSync(out, { recursive: true });
  for (const id of rawIds(builder)) {
    const dest = join(out, `${safe(id)}.jpg`);
    if (existsSync(dest)) { skip++; continue; }
    const r = spawnSync('curl', ['-s', '-f', '--max-time', '30', '-A', 'Mozilla/5.0', '-o', dest, cdn(id)]);
    if (r.status === 0 && existsSync(dest) && statSync(dest).size > 1000) {
      ok++;
      process.stdout.write('.');
    } else {
      if (existsSync(dest)) unlinkSync(dest);
      fail++;
      failed.push(id);
      process.stdout.write('x');
    }
  }
}
process.stdout.write('\n');
console.log(`zoom images: ok=${ok} skip=${skip} fail=${fail}`);
if (failed.length) console.log('FAILED:', failed.join(' '));
