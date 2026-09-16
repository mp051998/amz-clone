// Build lib/catalog.ts from scraped amazon.com products.
// - Downloads each product image (self-hosted; Amazon blocks hotlinking) into public/products/<safeId>.jpg
// - Authors realistic USD prices, sellers, deals, bullets deterministically (seeded by id → stable across runs)
// Run: node scripts/build-catalog.mjs
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = join(ROOT, 'public', 'products');

// [id, title, category, rating, reviewCount]  — id is Amazon's image id (also our product id)
const RAW = [
  // ── Electronics · Headphones ─────────────────────────────────────────────
  ['6181VJVcgSL', 'Hybrid Active Noise Cancelling Bluetooth Headphones, Over Ear, 120H Playtime', 'electronics', 4.7, 65],
  ['51CnDMbXZzL', 'Soundcore by Anker Q20i Hybrid Active Noise Cancelling Headphones, Bluetooth, Black', 'electronics', 4.5, 74000],
  ['61hzm0JOv3L', 'MEETION Tri-Mode Wireless Office Headset with ENC Mic, 40mm Speaker, White', 'electronics', 4.3, 128],
  ['71Hx8b6HGbL', 'KVIDIO Bluetooth Headphones Wireless Over Ear, 65H Playtime with Microphone', 'electronics', 4.5, 2100],
  ['61mcpfVlKVL', 'Bluetooth Headphones, Hybrid Active Noise Cancelling Over Ear, 35H Playtime', 'electronics', 4.4, 342],
  ['61DzAvRWJlL', 'HAOYUYAN Wireless Earbuds, Sports Bluetooth Headphones, 80Hrs Playtime', 'electronics', 4.2, 512],
  ['61P4QAI28CL', 'Fhumsh Wireless Earbuds, Bluetooth 5.3 HiFi Stereo 50H Playback, LED Display', 'electronics', 4.3, 233],
  ['61gS7RofWfL', 'SIMOLIO TV Headphones Wireless for Seniors with Bluetooth & Charging Dock', 'electronics', 4.4, 890],
  ['51rpbVmi9XL', 'Sony WH-CH720N Wireless Noise Cancelling Over-Ear Bluetooth Headphones, Black', 'electronics', 4.6, 12800],
  ['41lArSiD5hL', 'Sony WH-CH520 Wireless On-Ear Bluetooth Headphones with Microphone, Black', 'electronics', 4.5, 9400],
  ['71F2ccIPPLL', 'BERIBES Bluetooth Headphones Over Ear, HiFi Stereo Wireless Headset, 65H 6EQ', 'electronics', 4.4, 41000],
  ['41JACWT-wWL', 'Sony WH-CH520 Wireless On-Ear Bluetooth Headphones with Microphone, Blue', 'electronics', 4.5, 9400],
  ['61Vg5tvG7pL', 'Wireless Earbuds Bluetooth Headphones, 54H Playtime Stereo with ENC Mic', 'electronics', 4.3, 156],
  ['61gTcutSYML', 'Hybrid ANC Wireless Over-Ear Headphones, 100H Playtime, Hi-Res Audio', 'electronics', 4.5, 88],
  ['61PPiCaslSL', 'Wireless Earbuds, Bluetooth 5.4 Headphones HiFi Stereo, Touch Control, White', 'electronics', 4.2, 77],
  ['714leNyXHIL', 'Picun B8 Wireless Bluetooth Headphones, 120H Playtime, 3EQ Modes, Black', 'electronics', 4.4, 205],
  ['61D5ZCSIymL', 'Fhumsh Wireless Earbuds, Bluetooth 5.3 HiFi Stereo 50H Playback, LED, Deep Bass', 'electronics', 4.3, 190],
  // ── Computers · Laptops ──────────────────────────────────────────────────
  ['81RFGfu0skL', 'HP Essential Laptop 2026, Intel CPU, 128GB Storage, Office 365, Copilot AI, Windows 11', 'computers', 4.5, 146],
  ['818ezjaaQlL', 'Lenovo Essential 15.6" FHD Laptop, Intel Processor, 8GB DDR5, 128GB Storage', 'computers', 4.2, 946],
  ['81A4WdEAKgL', 'Dell XPS 14 14.5" WUXGA Laptop, Intel Core Ultra 7 255H, 16GB RAM, 1.5TB SSD', 'computers', 4.7, 42],
  ['81n1T4CYfmL', 'ASUS ROG Strix G16 (2025) Gaming Laptop, 16" 165Hz, RTX 5060, Intel Core i7', 'computers', 4.4, 588],
  ['71Q32-spf2L', 'HP 14" Laptop for 2026, MS Office & Win 11 Pro, Copilot AI, Intel 4-Core', 'computers', 4.4, 133],
  ['81jeyQboG0L', 'HP 2026 Essential Laptop, Intel Processor, 128GB Storage, Windows 11 Home', 'computers', 4.3, 340],
  ['71SAJlp6HtL', '14 Inch Laptop, 32GB RAM 1TB SSD, Intel 6500Y Processor, Long Battery Life', 'computers', 4.5, 61],
  ['711KQJBO1aL', '15.6" AI Laptop with Office 365, 6GB RAM 128GB SSD, Windows 11', 'computers', 4.3, 88],
  ['71HHF2jUnpL', 'Acer Nitro V 16S AI Gaming Laptop, Ryzen 7 260, RTX 5060 GPU, 16GB DDR5', 'computers', 4.4, 340],
  ['81RiFsuQynL', 'Lenovo 15.6" FHD Business Laptop, Intel Processor, 8GB DDR5, 128GB Storage', 'computers', 4.3, 210],
  // ── Home & Kitchen · Cookware ────────────────────────────────────────────
  ['818LlGeUuzL', 'CAROTE 26pcs Pots and Pans Set, Nonstick Cookware Sets, Non Stick Kitchen', 'home-kitchen', 4.7, 190],
  ['719iqR-lC1L', 'CAROTE 21pcs Pots and Pans Set Non Stick, Detachable Handle Cookware, Black', 'home-kitchen', 4.6, 220],
  ['71beDXOBCBL', 'T-fal Signature Nonstick Pots and Pans Set 12 Piece, Oven Safe, Black', 'home-kitchen', 4.7, 184],
  ['71Di+BO1KbL', 'T-fal Ultimate Hard Anodized Nonstick Pots and Pans Set 17 Piece, Dishwasher Safe', 'home-kitchen', 4.7, 188],
  ['619M4iJ6bzL', 'Cuisinart 17-Piece Pots and Pans Set, Non Stick Hard Anodized Cookware', 'home-kitchen', 4.6, 380],
  ['71M0+ZDeB7L', 'T-fal Ultimate Hard Anodized 12-Piece Ceramic Nonstick Cookware Set', 'home-kitchen', 4.6, 105],
  ['81EgmhSO9XL', 'CAROTE 19pcs Pots and Pans Set Non Stick, Detachable Handle Cookware Set', 'home-kitchen', 4.4, 322],
  ['71QGP9TL77L', 'Astercook 21 Pcs Pots and Pans Set, Ceramic Cookware, Detachable Handle', 'home-kitchen', 4.5, 94],
  ['510FYALKtDL', 'Cuisinart Pots and Pans Set, Nonstick with Aluminum Core, 11-Piece, Black', 'home-kitchen', 4.6, 210],
  ['813ILN8c7oL', 'Pots and Pans Set Non Stick, 31 Piece Induction Cookware & Bakeware Set', 'home-kitchen', 4.4, 506],
  ['71v2DeeTD8L', 'SENSARTE Nonstick Cookware Set 13 Pcs, Non Stick Pots and Pans Set, Cream', 'home-kitchen', 4.5, 630],
  ['61xAnFzjGbL', 'SENSARTE Ceramic Cookware Set 14 Piece, Induction Non-Toxic Pots and Pans', 'home-kitchen', 4.5, 180],
  ['71mDTOYtDSL', 'Amazon Basics Non-Stick Kitchen Cookware 8-Piece Set, Pots and Pans, Black', 'home-kitchen', 4.4, 290],
  // ── Fashion · Running shoes ──────────────────────────────────────────────
  ['51AMW3KWC6L', "Under Armour Men's Charged Assert 11 Running Shoes", 'fashion', 4.6, 190],
  ['41XNghIdXQL', "Under Armour Men's Charged Assert 10 Running Shoe", 'fashion', 4.5, 2490],
  ['61K+SC-qZfL', "ASICS Men's Gel-Excite 11 Running Shoes", 'fashion', 4.6, 1400],
  ['410-L0vF3+L', "Under Armour Men's Charged Assert 9 Running Shoe", 'fashion', 4.6, 5740],
  ['71dRz5HBeTL', "Brooks Men's Adrenaline GTS 25 Supportive Running Shoe", 'fashion', 4.5, 240],
  ['71OAOMRQJYL', "Brooks Men's Revel 8 Neutral Running Shoe", 'fashion', 4.3, 160],
  ['51aZZVEq3iL', "HOKA Men's Bondi 9 Road Running Shoe", 'fashion', 4.5, 330],
  ['71d5H67c0SL', "New Balance Men's Fresh Foam 520 v9 Running Shoe", 'fashion', 4.4, 360],
  // ── Beauty & Personal Care · Skincare ────────────────────────────────────
  ['715wx2B9REL', 'medicube PDRN Glow Essentials Kit, Mini Skincare Travel Set, 5-Step Routine', 'beauty', 4.6, 213],
  ['61VMCb9rs0L', 'Summer Fridays Jet Lag Essentials, Mini Hydrating Skin Care Set', 'beauty', 4.6, 380],
  ['71sWWbYc1rL', 'e.l.f. SKIN Holy Hydration! Hydrated Ever After Skincare Mini Kit', 'beauty', 4.7, 124],
  ['61QjtIrjK9L', 'e.l.f. SKIN Holy Hydration! Jet Set Hydration Kit, Cleanser + Balm', 'beauty', 4.7, 112],
  ['71M060QWH-L', 'mixsoon Pure Glow Essentials Set, 5-Step Korean Skincare Travel Kit', 'beauty', 4.7, 140],
  ['61j2pmEJW-L', 'Dr.Althea 345 Relief Cream & Mist Duo, Korean Vegan Skin Care Set', 'beauty', 4.7, 478],
  ['71huX-WZdTL', 'Sakura Skin Care Set for Kids & Teens, 6 PCS Gentle Routine', 'beauty', 4.6, 96],
  ['91iUn61g79L', 'Vitamin C Niacinamide Skincare Set, Daily Facial Care Routine, 6-Piece', 'beauty', 4.5, 556],
  ['71DmHyXrgpL', 'LAIKOU Skin Care Set, Korean Skin Care for Women, 5pcs Facial Kit', 'beauty', 4.5, 588],
  ['51+jDWarkrL', 'BYOMA So Hydrated Travel Size Gift Set, Skincare Minis Bundle', 'beauty', 4.6, 160],
  ['61245ffGcNL', 'LANEIGE Water Bank Blue Hyaluronic Cream Moisturizer for Combination Skin', 'beauty', 4.6, 832],
  ['71KVCB7vltL', 'QUIYUM Daily Skincare Set for Young Women, 6-Piece Facial Care Kit', 'beauty', 4.7, 316],
  // ── Books ────────────────────────────────────────────────────────────────
  ['81P0NvoRrWL', 'Theo of Golden: A Novel', 'books', 4.7, 1820],
  ['81gOlbDWpeL', 'Yesteryear: A GMA Book Club Pick — A Novel', 'books', 4.2, 1183],
  ['71o-qUYvuOL', 'Verity', 'books', 4.6, 500100],
  ['91BNEhDBzbL', "The Most Fun We Ever Had (Reese's Book Club Pick): A Novel", 'books', 4.1, 3400],
  ['81lplZAjvkL', 'The Correspondent: A Novel', 'books', 4.6, 940],
  ['A1vf-H-xJYL', 'The Book Club for Troublesome Women: A Novel', 'books', 4.4, 316],
  ['91p+KiZROdL', 'The Widow: A Novel', 'books', 4.4, 847],
  ['91z4fk9-0NL', "Something in the Water: Reese's Book Club — A Novel", 'books', 4.0, 2600],
  ['91Sy3S-198L', 'The Lost Bookshop: A Charming and Uplifting Novel', 'books', 4.4, 1900],
  ['91tK0tVAf+L', 'The Let Them Theory: A Tool to Transform Your Life', 'books', 4.6, 48100],
  ['81MSoBp+PAL', 'The Nightingale: A Novel', 'books', 4.7, 42230],
  ['91VZotRPO2L', 'The Housemaid', 'books', 4.5, 73180],
  // ── Toys & Games ─────────────────────────────────────────────────────────
  ['71uh0kUACRL', 'Melissa & Doug Get Well Doctor Kit Play Set, 25-Piece Wooden Toy', 'toys', 4.8, 880],
  ['710dSCrRISL', "Masterbee Kids Camera for Girls & Boys, 3-12 Years, 1080P HD Digital Camera", 'toys', 4.6, 150],
  ['81ll5SJkcQL', 'Melissa & Doug Wooden Kitchen Accessory 22-Piece Play Set', 'toys', 4.8, 430],
  ['71APFtgsw4L', 'Smartivity Montessori Slide Puzzle, Wooden Learning Toy for Kids 4-8', 'toys', 4.5, 210],
  ['71eSSNJH9fL', '4 Pack LCD Writing Tablet for Kids, 8.5 Inch Colorful Doodle Board', 'toys', 4.5, 540],
  ['71Lx-bmXe+L', '30 Pack Squishy Toys, Kawaii Mini Squishies Party Favors for Kids', 'toys', 4.6, 490],
  ['917ZRbSY9TL', '160 Pcs Fidget Toys Party Favors Pack, Pop Sensory Set for Kids', 'toys', 4.3, 150],
  ['815sofq0avL', 'Party Favors for Kids, 150-Pack Fidget Toys Bulk, Treasure Box Fillers', 'toys', 4.5, 270],
  ['71pyDjRPqhL', '1000X Handheld Digital Microscope for Kids, 2.0" IPS Screen, STEM Toy', 'toys', 4.5, 110],
  ['61Pg7ofgYHL', 'Nex Playground, The Active Play System for Kids & Families', 'toys', 4.7, 520],
  ['61VzFxBrh7L', 'Gesture Control RC Helicopter Toy for Kids, Rechargeable Mini Drone', 'toys', 3.2, 150],
  ['519Oty05lTL', 'Flycatcher smART Sketcher 2.0 Projector, Drawing Toy for Kids Ages 5+', 'toys', 4.6, 260],
  // ── Sports & Outdoors · Dumbbells ────────────────────────────────────────
  ['71ZbWyz0ndL', 'Adjustable Dumbbells Set of 2, Free Weights Dumbbell Set for Home Gym', 'sports', 4.0, 270],
  ['71qo+BoG6ML', '25/50/55 lbs Pair Adjustable Dumbbell Set for Men and Women', 'sports', 4.7, 407],
  ['81Ub7Swav5L', 'Adjustable Dumbbell Set, 20/33/45/70/90lbs Free Weights, 5-in-1', 'sports', 4.4, 563],
  ['71ciCTjzkTL', 'BYZOOM FITNESS Classic Series 50/55LB Adjustable Dumbbell Pair', 'sports', 4.7, 360],
  ['71GkVlCHO9L', 'Adjustable Dumbbell Set, 20/35/45/55/70/90lbs, 5-in-1 Weight Set', 'sports', 4.3, 130],
  ['71BE37ZZfLL', 'FEIERDUN DS2 Adjustable Dumbbells, 20-90lbs, 5-in-1 Weight Set', 'sports', 4.4, 50],
  ['61bboZ4Tc5L', 'Adjustable Dumbbell Set for Women & Men, 22LB/44LB Pair', 'sports', 4.6, 20],
  ['81yF5CpdlLL', 'PowerBlock Elite EXP Adjustable Dumbbells, Sold in Pairs, 5-50 lb', 'sports', 4.6, 260],
  ['91QxtmB7tEL', 'Amazon Basics Adjustable Dumbbell Hand Weight Set, 38 Pounds, Black', 'sports', 4.6, 101],
  ['71lLqhkGDvL', 'Adjustable Dumbbell Set, 20/30/45/70/90lbs Free Weight Set for Home', 'sports', 4.4, 210],
  ['61onq6KzE4L', 'Adjustable Dumbbell Set for Women & Men, 7.5-25LB Each', 'sports', 4.6, 467],
  ['81d+Qj-X74L', '5-in-1 Adjustable Dumbbell Set, Barbell & Kettlebell for Home Gym', 'sports', 4.7, 50],
];

const CATEGORIES = {
  electronics: { name: 'Electronics', min: 1999, max: 34999 },
  computers: { name: 'Computers', min: 29900, max: 149900 },
  'home-kitchen': { name: 'Home & Kitchen', min: 3900, max: 24900 },
  fashion: { name: 'Fashion', min: 4900, max: 15900 },
  beauty: { name: 'Beauty & Personal Care', min: 1200, max: 7900 },
  books: { name: 'Books', min: 999, max: 2800 },
  toys: { name: 'Toys & Games', min: 1499, max: 5999 },
  sports: { name: 'Sports & Outdoors', min: 3900, max: 39900 },
};

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

// price ending in .99 / .95 / .49 within [min,max]
function priceFrom(rng, min, max) {
  const span = max - min;
  const raw = min + Math.floor(rng() * span);
  const dollars = Math.round(raw / 100);
  const ending = [99, 95, 49, 0][Math.floor(rng() * 4)];
  return Math.max(min, dollars * 100 - 100 + ending);
}

const BRANDS = ['Sony', 'Anker', 'Soundcore', 'HP', 'Lenovo', 'Dell', 'ASUS', 'Acer', 'CAROTE', 'T-fal', 'Cuisinart', 'Astercook', 'SENSARTE', 'Under Armour', 'ASICS', 'Brooks', 'HOKA', 'New Balance', 'medicube', 'Summer Fridays', 'e.l.f.', 'mixsoon', 'LANEIGE', 'BYOMA', 'LAIKOU', 'Melissa & Doug', 'PowerBlock', 'FEIERDUN', 'BYZOOM', 'Flycatcher', 'MEETION', 'KVIDIO', 'BERIBES', 'Picun', 'Dr.Althea'];

function brandOf(title) {
  if (/^Amazon Basics/i.test(title)) return 'Amazon Basics';
  for (const b of BRANDS) if (title.toLowerCase().startsWith(b.toLowerCase())) return b;
  return null;
}

const BULLETS = {
  electronics: ['Immersive Hi-Res sound with deep, punchy bass', 'Bluetooth 5.3 stable wireless connection up to 33 ft', 'Built-in microphone for hands-free calls', 'Comfortable memory-foam ear cushions for all-day wear', 'Fast USB-C charging — a quick charge gives hours of play'],
  computers: ['Snappy multitasking for work, study, and everyday browsing', 'Crisp Full-HD display with anti-glare coating', 'All-day battery life keeps you unplugged for longer', 'Fast SSD storage boots in seconds', 'Backlit keyboard and precision touchpad'],
  'home-kitchen': ['Nonstick coating releases food easily and cleans in seconds', 'Even heat distribution with a sturdy aluminum core', 'Stay-cool ergonomic handles for a secure grip', 'Oven and dishwasher safe for effortless cooking', 'Complete set covers every everyday cooking need'],
  fashion: ['Lightweight, breathable mesh upper keeps feet cool', 'Cushioned midsole absorbs impact on every stride', 'Durable rubber outsole grips wet and dry surfaces', 'Padded collar and tongue for a locked-in fit', 'Everyday comfort for running, gym, and casual wear'],
  beauty: ['Gentle, dermatologist-tested formula for daily use', 'Deeply hydrates and restores a healthy glow', 'Travel-friendly sizes — perfect for on the go', 'Free from parabens and harsh sulfates', 'Suitable for all skin types, including sensitive'],
  books: ['A gripping story you won’t be able to put down', 'Print length crafted for immersive weekend reading', 'A reader-favorite pick with rave reviews', 'Beautifully written and impossible to forget'],
  toys: ['Sparks imaginative, screen-free play', 'Built tough from kid-safe, durable materials', 'Encourages learning, creativity, and motor skills', 'Makes a great birthday or holiday gift', 'Recommended for hours of independent fun'],
  sports: ['Adjustable weight adapts as your strength grows', 'Space-saving design replaces a full rack of dumbbells', 'Secure locking mechanism for safe lifting', 'Durable, non-slip grip handle', 'Ideal for home-gym strength training'],
};

const safe = (id) => id.replace(/[^A-Za-z0-9]/g, '');
const cdn = (id) => `https://m.media-amazon.com/images/I/${id}._AC_SL400_.jpg`;

async function download(id) {
  const dest = join(IMG_DIR, `${safe(id)}.jpg`);
  if (existsSync(dest)) return 'skip';
  const r = spawnSync('curl', ['-s', '-f', '--max-time', '30', '-o', dest, cdn(id)]);
  return r.status === 0 && existsSync(dest) ? 'ok' : 'fail';
}

function boughtLabel(reviews, rng) {
  if (reviews >= 30000) return '10K+ bought in past month';
  if (reviews >= 5000) return '5K+ bought in past month';
  if (reviews >= 800) return '1K+ bought in past month';
  if (reviews >= 200 && rng() > 0.4) return '500+ bought in past month';
  if (reviews >= 80 && rng() > 0.6) return '100+ bought in past month';
  return null;
}

async function main() {
  const products = [];
  let ok = 0, skip = 0, fail = 0;
  const failed = [];

  for (const [id, title, category, rating, reviewCount] of RAW) {
    const st = await download(id);
    if (st === 'ok') ok++; else if (st === 'skip') skip++; else { fail++; failed.push(id); }

    const rng = seed(id);
    const cat = CATEGORIES[category];
    const priceMinor = priceFrom(rng, cat.min, cat.max);
    // ~45% carry a list-price markup (a "deal")
    const hasDeal = rng() < 0.45;
    const pct = 0.1 + rng() * 0.35; // 10–45% off
    const listMinor = hasDeal ? Math.round(priceMinor / (1 - pct) / 100) * 100 - 1 : undefined;
    const dealPct = hasDeal ? Math.round((1 - priceMinor / listMinor) * 100) : undefined;

    const brand = brandOf(title);
    const amazonSold = brand === 'Amazon Basics' || rng() < 0.35;
    const seller = amazonSold ? 'Amazon.com' : brand ? `${brand} Official Store` : 'Marketplace Seller';
    const shipsFrom = 'Amazon';

    const bset = BULLETS[category];
    const bstart = Math.floor(rng() * Math.max(1, bset.length - 3));
    const bullets = bset.slice(bstart, bstart + 4);

    let badge;
    const br = rng();
    if (rating >= 4.5 && reviewCount >= 500 && br < 0.4) badge = "Amazon's Choice";
    else if (reviewCount >= 20000 && br < 0.7) badge = 'Best Seller';
    else if (rating >= 4.6 && br < 0.25) badge = 'Overall Pick';

    products.push({
      id: safe(id), title, brand: brand || undefined, category,
      image: `/products/${safe(id)}.jpg`,
      priceMinor, listMinor, dealPct: dealPct || undefined,
      rating, reviewCount, seller, shipsFrom, bullets,
      badge, deal: hasDeal || undefined,
      boughtPastMonth: boughtLabel(reviewCount, rng) || undefined,
    });
    process.stdout.write(st === 'ok' ? '.' : st === 'skip' ? '·' : 'x');
  }
  process.stdout.write('\n');
  console.log(`images: ok=${ok} skip=${skip} fail=${fail}`);
  if (failed.length) console.log('FAILED:', failed.join(' '));

  const ts = renderTs(products);
  await writeFile(join(ROOT, 'lib', 'catalog.ts'), ts);
  console.log(`wrote lib/catalog.ts — ${products.length} products across ${Object.keys(CATEGORIES).length} categories`);
}

function renderTs(products) {
  const cats = Object.entries(CATEGORIES).map(([slug, c]) => `  { slug: ${JSON.stringify(slug)}, name: ${JSON.stringify(c.name)} },`).join('\n');
  const rows = products.map((p) => '  ' + JSON.stringify(p) + ',').join('\n');
  return `// AUTO-GENERATED by scripts/build-catalog.mjs — do not edit by hand.
// Real amazon.com product titles/ratings; images self-hosted; USD prices authored for the demo.

export interface Product {
  id: string;
  title: string;
  brand?: string;
  category: string;
  image: string;
  priceMinor: number;
  listMinor?: number;
  dealPct?: number;
  rating: number;
  reviewCount: number;
  seller: string;
  shipsFrom: string;
  bullets: string[];
  badge?: string;
  deal?: boolean;
  boughtPastMonth?: string;
}

export interface Category {
  slug: string;
  name: string;
}

export const categories: Category[] = [
${cats}
];

export const products: Product[] = [
${rows}
];

const byId = new Map(products.map((p) => [p.id, p]));
export const getProduct = (id: string): Product | undefined => byId.get(id);
export const categoryName = (slug: string): string =>
  categories.find((c) => c.slug === slug)?.name ?? slug;
export const productsIn = (slug: string): Product[] =>
  products.filter((p) => p.category === slug);
export const deals = (): Product[] => products.filter((p) => p.deal && p.dealPct);
export function searchProducts(q: string): Product[] {
  const t = q.trim().toLowerCase();
  if (!t) return products;
  const terms = t.split(/\\s+/);
  return products.filter((p) => {
    const hay = (p.title + ' ' + (p.brand ?? '') + ' ' + categoryName(p.category)).toLowerCase();
    return terms.every((w) => hay.includes(w));
  });
}
`;
}

main();
