// Build lib/catalog-in.ts — the amazon.in catalog (separate from amazon.com).
// - Real amazon.in product image ids/titles/ratings harvested from amazon.in search.
// - Images self-hosted (Amazon blocks hotlinking) into public/products/in/<safeId>.jpg
// - Prices are INR-native (curBase 'INR'); sellers/deals/bullets authored deterministically (seeded by id).
// Product ids are prefixed `in-` so they never collide with the amazon.com catalog.
// Run: node scripts/build-catalog-in.mjs
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = join(ROOT, 'public', 'products', 'in');

// [imageId, title, category, rating, reviewCount, priceRupees] — real amazon.in listings
const RAW = [
  // ── Electronics · Headphones (Indian audio brands) ───────────────────────
  ['61BWskzWNIL', 'boAt Rockerz 371 Bluetooth Headphones, 40mm Drivers, 50H Battery, ENx Tech, BT v5.4, Foldable', 'electronics', 4.0, 846, 1099],
  ['711l4y8aNlL', 'boAt Rockerz 480 RGB Bluetooth Headphones, 6 Light Modes, 40mm Drivers, 60H Battery, ENx Tech', 'electronics', 4.1, 4787, 1899],
  ['71QdB7hDCAL', 'boAt Rockerz 411 Bluetooth Headphones, 40ms Low Latency, 40H Battery, ENx Tech, App Support', 'electronics', 4.2, 29139, 1499],
  ['51lPcFkwYmL', 'Noise Airwave Max XR Wireless Over-Ear Headphones, 120H Playtime, ANC, Spatial Audio', 'electronics', 4.1, 688, 2999],
  ['6163uYK3eeL', 'Boult Q Over-Ear Bluetooth Headphones, 70H Playtime, 40mm Bass Drivers, Zen ENC Mic, Type-C', 'electronics', 4.0, 1191, 1799],
  ['61qVKj0RGfL', 'Zebronics Silencio 200T Wireless Headphones, Hybrid ANC 48dB, 100H Playback, 40mm Drivers, Dual Mic', 'electronics', 3.8, 145, 2999],
  ['51rE6m+PHnL', 'Portronics Muffs M2 On-Ear Bluetooth Headphones, 40H Playtime, 40mm Dynamic Drivers, AUX 3.5mm', 'electronics', 3.9, 1675, 869],
  // ── Computers · Laptops ──────────────────────────────────────────────────
  ['61qL-lDAZEL', 'Lenovo V15 G4 AMD Ryzen 5 7520U 15.6" FHD Laptop, 16GB DDR5, 512GB NVMe SSD, Windows 11', 'computers', 4.0, 498, 58090],
  ['71JcEk00fqL', 'HP 15 AMD Ryzen 3 7320U Laptop, 8GB LPDDR5, 512GB SSD, 15.6" FHD Anti-Glare Micro-Edge, Win 11', 'computers', 4.2, 137, 56990],
  ['71Ws1bRoM3L', 'ASUS Vivobook 15 Intel Core i5-13420H, 16GB RAM, 1TB SSD, 15.6" FHD, Backlit Keyboard, Windows 11', 'computers', 4.5, 62, 68990],
  ['716M8uhjvSL', 'Apple 2026 MacBook Air 15" Laptop, M5 chip, Apple Intelligence, 15.3" Liquid Retina Display', 'computers', 4.8, 73, 166990],
  ['71lPJIfGX1L', 'ASUS Vivobook S14 (2026), Intel Core 7 350, 16GB RAM, 512GB SSD, 14" FHD+ Display', 'computers', 4.3, 120, 118990],
  ['61AccNkmFFL', 'Lenovo V15 G4 AMD Athlon Silver 7120U Laptop, 8GB LPDDR5, 512GB SSD, 15.6" FHD, Windows 11', 'computers', 4.0, 387, 46999],
  // ── Home & Kitchen · Pressure cookers (Hawkins / Prestige) ───────────────
  ['61W+5VjoziL', 'Hawkins 3 Litre Inner Lid Pressure Cooker, Stainless Steel, Induction Compatible, Silver (HSS3W)', 'home-kitchen', 4.4, 22258, 2779],
  ['619Cm+DHn8L', 'Hawkins Contura Black 1.5 Litre Hard Anodised Inner Lid Pressure Cooker, Baby Cooker (CB15)', 'home-kitchen', 4.3, 39849, 1507],
  ['51LKIBnva1L', 'Hawkins Contura Black XT 3 Litre Induction Aluminium Inner Lid Pressure Cooker (CXT30)', 'home-kitchen', 4.4, 11180, 2350],
  ['51pwtOYh+qL', 'Hawkins Classic 1.5 Litre Aluminium Pressure Cooker, Straight Body, Gas Compatible', 'home-kitchen', 4.2, 22249, 1119],
  ['51imT7YoPHL', 'Prestige Popular Max Aluminium Outer Lid Pressure Cooker Combo, 2L + 3L + 5L, Gas & Induction', 'home-kitchen', 3.9, 4503, 2962],
  ['51r9ZGmYADL', 'Prestige Nakshatra Duo 3 Litre Aluminium Inner Lid Pressure Cooker, Stainless Steel Lid', 'home-kitchen', 4.2, 4699, 1518],
  // ── Fashion · Running shoes (Campus / Sparx) ─────────────────────────────
  ['61rWcMP4s9L', 'Campus Men First Running Shoes, Lightweight Lace-Up Sports Shoes', 'fashion', 4.0, 18270, 1199],
  ['61Il0xGaORL', 'Campus Men Hurricane Running Shoes, Cushioned Everyday Trainers', 'fashion', 4.2, 7846, 999],
  ['61XwYMOyfwL', 'Campus Men Wells Running Shoes, Breathable Mesh Upper', 'fashion', 4.2, 4039, 712],
  ['612dWsWvGRL', 'Sparx Men SM 406 Running Shoes, Enhanced Durability & Soft Cushion, Grey', 'fashion', 4.1, 2730, 891],
  ['719ojmA9G7L', 'Boldfit Running Shoes for Men, Soft Sole Lightweight Sports Shoes, Anti-Skid', 'fashion', 3.8, 1281, 1099],
  ['61TxjQ3FzEL', 'Impakto Driftwave Men Running Shoes, Lightweight & Breathable for Gym, Training & Travel', 'fashion', 4.1, 81, 799],
  // ── Beauty & Personal Care · Skincare (Indian D2C brands) ────────────────
  ['51zZo49wleL', 'Mamaearth Vitamin C Daily Glow Face Serum for Men & Women, Glowing Skin, Oily & Dry Skin', 'beauty', 4.0, 5240, 319],
  ['61vmEu4MuZL', 'Minimalist 10% Vitamin C Face Serum for Glowing Skin, Brightening & Dark Spot Treatment', 'beauty', 4.1, 24194, 284],
  ['515lLW9XLkL', 'Minimalist Niacinamide 5% Face Serum with Hyaluronic Acid, Reduces Dark Spots, Controls Oil', 'beauty', 4.2, 10461, 249],
  ['51fdXXI+WFL', 'Mamaearth Rice Dewy Bright Face Wash with Rice Water & Niacinamide, 100ml', 'beauty', 4.3, 13263, 275],
  ['51c42aoYEeL', 'Lakme Peach Milk Sunscreen Moisturiser SPF 50 PA+++ with Pro-Ceramides, 2-in-1 Daily Face Cream', 'beauty', 4.4, 44, 302],
  ['61BKbjrFySL', 'Lotus Professional PhytoRx Sunblock Mist SPF 50 PA+++, Non-Greasy Finish, High Sun Protection', 'beauty', 3.9, 1014, 651],
  ['61cZOENaP1L', 'Mamaearth Korean Glass Skin Combo, Rice Face Wash 100ml + Rice Oil-Free Moisturizer 80g', 'beauty', 4.2, 211, 433],
  // ── Books (India bestsellers) ────────────────────────────────────────────
  ['81loPDFi-wL', 'The Housemaid: An Absolutely Addictive Psychological Thriller (The Housemaid, Book 1)', 'books', 4.4, 699128, 335],
  ['7144d+xKjVL', 'The Art of War', 'books', 4.1, 20244, 115],
  ['81Ypb9lrEQL', 'War and Peace by Leo Tolstoy, Premium Classic Edition, Historical Fiction, Russian Literature', 'books', 4.4, 3097, 599],
  ['81t6xQeZA8L', 'The Stationery Shop of Tehran', 'books', 4.4, 20230, 283],
  ['813P4lxRaLL', 'Samsara: Enter the Valley of the Gods, Indian Mythological Fiction Novel', 'books', 4.3, 2593, 218],
  ['81tmzGnqseL', 'The Kalki Trilogy (Set of 3 Books): Avatar of Vishnu, Eye of Brahma and Sword of Shiva', 'books', 4.5, 923, 579],
  ['81AFx0AuG-L', 'The Best of Sherlock Holmes (Set of 2 Books), Adventures of Sherlock Holmes & Complete Novels', 'books', 4.5, 2293, 369],
  // ── Toys & Games (India learning toys) ───────────────────────────────────
  ['710oqNs2J-L', 'Novo Baby Smart Activity Fun & Learning Blocks, Geometric Educational Sorter Toy', 'toys', 4.2, 1347, 180],
  ['71VAUdhYJGL', 'Novo Baby Wooden ABCD Learning Board for Kids, Activity Toy for Toddlers & Preschoolers', 'toys', 4.2, 1718, 274],
  ['61vq6mEiQ7L', 'Storio Montessori Talking Flash Cards for Kids 2-5 Years, Rechargeable Educational Learning Toy', 'toys', 4.2, 830, 328],
  ['810NYpQWZ1L', 'Eitheo Kids Learning Phone Toy, Rechargeable Talking Mobile for Kids 2-6 Years, 24 Activities', 'toys', 4.7, 46, 338],
  ['71PRHle65CL', 'Kids Phone Rechargeable Toy with 24 Learning Modes, Talking Dummy Mobile for Kids 2-12', 'toys', 3.3, 433, 384],
  ['817az4dHG2L', 'Eitheo Geometric Angle Blocks for Kids, 26 Pcs Montessori Sorting & Stacking Educational Toy', 'toys', 3.9, 1140, 138],
  // ── Sports & Outdoors · Dumbbells ────────────────────────────────────────
  ['61qEWRcwEUL', 'Flexnest Adjustable Iron Dumbbells Set, Easy Weight Adjustment 2.5kg-24kg, Home Workout', 'sports', 4.3, 673, 16998],
  ['618Nlj8pN3L', 'Burnlab 6-in-1 Multifunctional Weight Training Kit, Dumbbells, Kettlebells, Barbells & Push-up Brackets', 'sports', 4.3, 550, 4199],
  ['71WvlgmK+iL', 'Amazon Brand Symactive PVC 3-in-1 Convertible Dumbbells Set', 'sports', 4.0, 1759, 659],
  ['61NEUWb5A4L', 'Amazon Brand Symactive 20 Kg Adjustable Dumbbell Set, Durable PVC Plates with Secure Weight-Locking', 'sports', 3.9, 1909, 799],
  ['51RCPRgChnL', 'FitBox Sports Intruder 20 Kg Adjustable PVC Dumbbells with Rods for Home Gym & Strength Training', 'sports', 3.7, 4977, 749],
  ['71br5ecT1kL', 'Sparnod Fitness SAD 12.5 Adjustable Dumbbell, 12.5kg with 11 Weight Increments', 'sports', 3.6, 11, 6999],
  ['710aan3QRaL', 'Sparnod Fitness SAD-25 Adjustable 3-in-1 Dumbbell Set, 3-24kg Quick Weight Change, Barbell, Kettlebell', 'sports', 3.8, 11, 11999],
];

// ── deterministic pseudo-random seeded by id ──────────────────────────────
function seed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// Brands recognised at the start of a title (longest-first so "boAt" wins before "bo").
const BRANDS = ['boAt', 'Noise', 'Boult', 'Zebronics', 'Portronics', 'Lenovo', 'HP', 'ASUS', 'Apple', 'Hawkins', 'Prestige', 'Campus', 'Sparx', 'Boldfit', 'Impakto', 'Mamaearth', 'Minimalist', 'Lakme', 'Lotus', 'Novo', 'Storio', 'Eitheo', 'Flexnest', 'Burnlab', 'FitBox', 'Sparnod'];

function brandOf(title) {
  if (/^Amazon Brand Symactive/i.test(title)) return 'Symactive';
  for (const b of BRANDS) if (title.toLowerCase().startsWith(b.toLowerCase())) return b;
  return null;
}

const BULLETS = {
  electronics: ['Immersive sound with deep, punchy bass', 'Bluetooth 5.3 stable wireless connection up to 10 m', 'Built-in mic with ENx tech for clear calls', 'Fast USB-C charging — 10 min for hours of play', 'Comfortable cushions for all-day wear'],
  computers: ['Snappy everyday performance for work and study', 'Crisp Full-HD anti-glare display', 'All-day battery for work on the go', 'Fast SSD storage boots in seconds', 'Windows 11 with lifetime validity'],
  'home-kitchen': ['ISI-marked, made in India for everyday cooking', 'Works on gas and induction cooktops', 'Sturdy build with a secure locking lid', 'Even heat for faster, fuel-saving cooking', 'Backed by a manufacturer warranty'],
  fashion: ['Lightweight, breathable mesh upper keeps feet cool', 'Cushioned sole absorbs impact on every stride', 'Durable anti-skid outsole grips every surface', 'Lace-up fit for daily running, gym and walking', 'Everyday comfort for Indian roads and weather'],
  beauty: ['Made for Indian skin and climate', 'Dermatologically tested, gentle for daily use', 'Free from parabens, sulphates and mineral oil', 'Deeply hydrates for a healthy, natural glow', 'Suitable for all skin types'],
  books: ['A gripping read you won’t be able to put down', 'Print length crafted for immersive weekend reading', 'A reader-favourite pick with rave reviews', 'Beautifully written and impossible to forget'],
  toys: ['Sparks imaginative, screen-free play', 'Made from kid-safe, durable materials', 'Builds learning, creativity and motor skills', 'A great return-gift or birthday present', 'Recommended for hours of independent fun'],
  sports: ['Adjustable weight adapts as your strength grows', 'Space-saving design for a home gym', 'Secure locking mechanism for safe lifting', 'Durable, non-slip grip handle', 'Ideal for home strength training'],
};

// India marketplace sellers (mirrors real amazon.in "Sold by").
const AMZ_SELLERS = ['Appario Retail Private Ltd', 'Cocoblu Retail', 'Cloudtail India', 'RetailEZ Private Limited'];

const safe = (id) => id.replace(/[^A-Za-z0-9]/g, '');
const cdn = (id) => `https://m.media-amazon.com/images/I/${id}._AC_SL400_.jpg`;

async function download(id) {
  const dest = join(IMG_DIR, `${safe(id)}.jpg`);
  if (existsSync(dest)) return 'skip';
  const r = spawnSync('curl', ['-s', '-f', '--max-time', '30', '-o', dest, cdn(id)]);
  return r.status === 0 && existsSync(dest) ? 'ok' : 'fail';
}

function boughtLabel(reviews, rng) {
  if (reviews >= 100000) return '10K+ bought in past month';
  if (reviews >= 20000) return '5K+ bought in past month';
  if (reviews >= 3000) return '1K+ bought in past month';
  if (reviews >= 500 && rng() > 0.4) return '500+ bought in past month';
  if (reviews >= 100 && rng() > 0.6) return '100+ bought in past month';
  return null;
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });
  const products = [];
  let ok = 0, skip = 0, fail = 0;
  const failed = [];

  for (const [id, title, category, rating, reviewCount, priceRupees] of RAW) {
    const st = await download(id);
    if (st === 'ok') ok++; else if (st === 'skip') skip++; else { fail++; failed.push(id); }

    const rng = seed(id);
    // ~50% carry an INR list-price markup (a "deal"), rounded to end in 9.
    const hasDeal = rng() < 0.5;
    const pct = 0.12 + rng() * 0.4; // 12–52% off
    const listRupees = hasDeal ? Math.round(priceRupees / (1 - pct) / 10) * 10 - 1 : undefined;
    const dealPct = hasDeal ? Math.round((1 - priceRupees / listRupees) * 100) : undefined;

    const brand = brandOf(title);
    const amazonBrand = brand === 'Symactive';
    const amazonSold = amazonBrand || rng() < 0.4;
    const seller = amazonSold
      ? AMZ_SELLERS[Math.floor(rng() * AMZ_SELLERS.length)]
      : brand ? `${brand} Official Store` : 'RetailEZ Private Limited';

    const bset = BULLETS[category];
    const bstart = Math.floor(rng() * Math.max(1, bset.length - 3));
    const bullets = bset.slice(bstart, bstart + 4);

    let badge;
    const br = rng();
    if (rating >= 4.3 && reviewCount >= 2000 && br < 0.4) badge = "Amazon's Choice";
    else if (reviewCount >= 10000 && br < 0.7) badge = 'Bestseller';
    else if (hasDeal && dealPct >= 30 && br < 0.5) badge = 'Limited time deal';

    products.push({
      id: `in-${safe(id)}`, title, brand: brand || undefined, category,
      image: `/products/in/${safe(id)}.jpg`,
      priceMinor: priceRupees * 100, listMinor: listRupees ? listRupees * 100 : undefined,
      dealPct: dealPct || undefined,
      rating, reviewCount, seller, shipsFrom: 'Amazon', bullets,
      badge, deal: hasDeal || undefined, curBase: 'INR',
      boughtPastMonth: boughtLabel(reviewCount, rng) || undefined,
    });
    process.stdout.write(st === 'ok' ? '.' : st === 'skip' ? '·' : 'x');
  }
  process.stdout.write('\n');
  console.log(`images: ok=${ok} skip=${skip} fail=${fail}`);
  if (failed.length) console.log('FAILED:', failed.join(' '));

  const rows = products.map((p) => '  ' + JSON.stringify(p) + ',').join('\n');
  const ts = `// AUTO-GENERATED by scripts/build-catalog-in.mjs — do not edit by hand.
// Real amazon.in product titles/ratings; images self-hosted; INR-native prices (curBase 'INR').
// Ids are prefixed \`in-\` so they never collide with the amazon.com catalog.
import type { Product } from './catalog';

export const productsIN: Product[] = [
${rows}
];
`;
  await writeFile(join(ROOT, 'lib', 'catalog-in.ts'), ts);
  console.log(`wrote lib/catalog-in.ts — ${products.length} products`);
}

main();
