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
  // ── Electronics · Wireless earbuds (Indian audio brands) ─────────────────
  ['51nBTTG3hNL', 'OnePlus Nord Buds 3r TWS Earbuds, up to 54H Playback, 2-Mic Clear Calls, 3D Spatial Audio, 12.4mm Drivers, Bluetooth 5.4', 'electronics', 4.3, 49700, 1999],
  ['61vEGUBSswL', 'Noise Buds Mini Truly Wireless Earbuds (2026), Half In-Ear Design, 40H Playtime, Quad Mic ENC, 13mm Driver, Bluetooth 5.3', 'electronics', 3.8, 10200, 899],
  ['71FOccCOQmL', 'boAt Airdopes 219 TWS Earbuds, 4 Mics ENx Tech, 40H Battery, App Support, Bluetooth Wireless, Fast Charging', 'electronics', 3.9, 7700, 1099],
  ['81-TGXuOMAL', 'boAt Nirvana Ion TWS Earbuds, 120H Battery, Crystal Bionic Sound, Dual EQ Modes, 4 Mics ENx, IPX4, Bluetooth 5.2', 'electronics', 4.1, 20800, 1799],
  // ── Computers · Laptops ──────────────────────────────────────────────────
  ['71r2ySSfgBL', 'HP Victus Gaming Laptop, AMD Ryzen 7 7445HS, 6GB RTX 4050, 16GB DDR5, 512GB SSD, 15.6" FHD 144Hz IPS, Windows 11', 'computers', 4.1, 130, 107990],
  ['61aLy7kImQL', 'HP OmniBook 5 OLED (Previously Pavilion), Snapdragon X 45 TOPS, 16GB LPDDR5x, 512GB SSD, 2K 14" Display, Windows 11', 'computers', 4.1, 133, 79990],
  ['41bdNUDc8pL', 'Acer Aspire 3 Laptop, Intel Celeron N4500, 8GB LPDDR4X, 256GB SSD, 15.6" HD, Windows 11 Home, HD Webcam', 'computers', 3.4, 233, 35640],
  ['71D9HSayVSL', 'Lenovo IdeaPad Slim 3, 13th Gen Intel Core i5-13420H, 24GB RAM, 1TB SSD, 15.3" WUXGA IPS, Windows 11, Office 2024', 'computers', 4.1, 100, 87690],
  // ── Home & Kitchen · Pressure cookers (Hawkins / Pigeon / Butterfly) ─────
  ['51K1LMDAvkL', 'Hawkins 3 Litre Contura Black Pressure Cooker, Hard Anodised Inner Lid Cooker, Handi Cooker, Induction & Gas (CB30)', 'home-kitchen', 4.3, 39800, 2059],
  ['51z8bjUc4kL', 'Hawkins Classic 2 Litre Pressure Cooker, Straight Body, Gas Compatible, Ideal for 2-3 Persons, ISI Certified', 'home-kitchen', 4.2, 22200, 1276],
  ['510szauOgxL', 'Pigeon by Stovekraft All in One Super Cooker 620-H, 3 Litre Hard Anodised Outer Lid Pressure Cooker, Black Aluminium', 'home-kitchen', 4.0, 16100, 1999],
  ['51ZHXd88HjL', 'Butterfly Curve 2 Litre Stainless Steel Outer Lid Pressure Cooker, Triply Base, Induction & Gas Stove Compatible', 'home-kitchen', 4.1, 23500, 1539],
  // ── Fashion · Running shoes for women (Campus / Sparx / ASIAN) ───────────
  ['712NemmvADL', 'SPARX Women Pull-On Sneaker Shoes, Lightweight Slip-On Running & Walking Shoes', 'fashion', 4.2, 17900, 699],
  ['61IZBgcmG+L', 'Campus Women Claire Running Shoes, Cushioned Lace-Up Sports Shoes', 'fashion', 4.2, 7500, 1079],
  ['61vRXtZcy7L', 'ASIAN Women Sports Running Shoes, Walking, Gym Casual Lace-Up Sneakers for Girls', 'fashion', 4.0, 13400, 699],
  ['61a+bSFH0qL', 'Campus Women Alice Running Shoes, Breathable Lace-Up Everyday Trainers', 'fashion', 4.2, 6300, 919],
  // ── Beauty & Personal Care · Sunscreen (Indian D2C brands) ───────────────
  ['61tvX-QQDhL', 'Minimalist Sunscreen SPF 50 PA++++ with Niacinamide & Multi-Vitamins, Broad Spectrum, Hydrating for Dry & All Skin, 50g', 'beauty', 4.1, 35800, 245],
  ['51gQUz3N6ZL', 'The Derma Co 1% Hyaluronic Sunscreen Aqua Gel SPF 50 PA++++, Hydrating, Lightweight & Non-Greasy, No White Cast, 50g', 'beauty', 4.2, 41700, 233],
  ['51Y0eeQykEL', 'Aqualogica Glow+ Dewy Gel Sunscreen SPF 50+ PA++++, In-Vivo Tested, New-Age UV Filters, 12-Hour Sun Protection, 80g', 'beauty', 4.2, 20700, 368],
  ['61ckTgN44WL', 'Dot & Key Vitamin C + E Super Bright Sunscreen SPF 50+ PA++++, In-Vivo Tested, Water-Light Fluid, No White Cast, 50g', 'beauty', 4.2, 14900, 396],
  // ── Books (India bestsellers) ────────────────────────────────────────────
  ['A1dtQ-soQEL', 'The Palace of Illusions: 15th Anniversary Edition by Chitra Banerjee Divakaruni', 'books', 4.5, 12854, 330],
  ['61qTWmEi5GL', 'Never Lie: An Addictive Psychological Thriller with Mind-Bending Twists by Freida McFadden', 'books', 4.4, 354522, 355],
  ['814n9NoAW4L', 'Anxious People: The No. 1 New York Times Bestseller, Now a Netflix Series by Fredrik Backman', 'books', 4.6, 91530, 434],
  ['71xxddxprOL', 'Days at the Morisaki Bookshop: The Perfect Book to Curl Up With, Japanese Translated Fiction', 'books', 4.4, 13886, 259],
  // ── Toys & Games (India learning toys) ───────────────────────────────────
  ['71APFtgsw4L', 'Smartivity Montessori Slide Puzzle, Wooden Toy for Kids 4-8 Years, Colour & Pattern Matching Learning Toy', 'toys', 4.4, 2000, 456],
  ['71wtNAEfGEL', 'VEBETO Kids Piano Keyboard with Mic, 37 Keys, 8 Rhythms, 8 Tones, 6 Demos, Portable Electronic Musical Toy', 'toys', 3.9, 5200, 698],
  ['61-31DPnzIL', 'WireScorts Baby & Toddler First Educational Blocks, Shape Sorter, Colours & ABCD Learning Toy for 1+ Years', 'toys', 4.2, 4600, 239],
  ['61TXpN40ROL', 'Humming Bird Kids 80 Pcs Big Mega Blocks, Building & Construction Set for Boys & Girls, Multicolour', 'toys', 3.9, 4200, 299],
  // ── Sports & Outdoors · Dumbbells (home gym) ─────────────────────────────
  ['6197rTwYArL', 'Amazon Basics Rubber Encased Hex Dumbbell Weight, Set of 2, 2.5 Kg, Black', 'sports', 4.5, 34000, 1139],
  ['710SxepIfiL', 'Lifelong PVC Hex Dumbbells Pack of 2 (3 Kg x 2) for Home Gym, Fitness Weights for Men & Women', 'sports', 4.0, 22000, 354],
  ['71uneWbTPpL', 'Kore 20 Kg PVC-DM Combo Home Gym Dumbbells Kit (3 Kg x 4 + 2 Kg x 4 Plates), Black', 'sports', 3.6, 19800, 749],
  ['61mUc9vBJqL', 'RUBX Rubber Coated Professional Hex Dumbbells (Pack of 2), 5 Kg x 2 (Total 10 Kg), Silver', 'sports', 4.6, 10200, 1609],
  // ── Mobiles (amazon.in dedicated Mobiles nav) ────────────────────────────
  ['719GNPKA8OL', 'Redmi 15C 5G Prime Edition (Dusk Purple, 6GB RAM, 128GB Storage), 6000mAh Battery, 50MP AI Camera', 'mobiles', 4.1, 8421, 19499],
  ['71UzHCLBm1L', 'Samsung Galaxy M36 5G (Serene Green, 8GB RAM, 128GB Storage), Corning Gorilla Glass Victus+, 50MP Triple Camera', 'mobiles', 4.1, 6033, 25250],
  ['71K8ghTEGlL', 'Samsung Galaxy M06 5G (Blazing Black, 6GB RAM, 128GB Storage), 5000mAh Battery, 25W Fast Charging', 'mobiles', 4.1, 12894, 18999],
  ['61poC8L0VAL', 'realme C71 4G (Black, 4GB RAM, 64GB Storage), 6300mAh Titan Battery, IP67 Dust & Water Resistant', 'mobiles', 3.6, 5127, 12899],
  ['61ImCLk1sqL', 'iQOO Z10 Lite 5G (Cyber Green, 4GB RAM, 64GB Storage), 6000mAh Battery, Snapdragon 4 Gen 2', 'mobiles', 4.1, 3402, 16999],
  ['51A42gljwLL', 'Motorola G57 Power 5G (Fluidity, 8GB RAM, 128GB Storage), 7000mAh Battery, Snapdragon 6s Gen 3', 'mobiles', 4.2, 2188, 20999],
  ['71MJioULjzL', 'Samsung Galaxy A56 5G (Awesome Olive, 8GB RAM, 256GB Storage), Gorilla Glass Victus+, 50MP OIS Camera', 'mobiles', 4.4, 4761, 38999],
  ['41t4RIHRQtL', 'OPPO K14x 5G (Icy Blue, 6GB RAM, 128GB Storage), 7000mAh Battery, 45W SuperVOOC Charging, IP69 Rated', 'mobiles', 3.8, 1043, 21699],
  ['617O+RkwdPL', 'Apple iPhone 17 (256 GB), A19 Chip, 6.3" Super Retina XDR Display, 48MP Dual Fusion Camera System', 'mobiles', 4.6, 2274, 99900],
  ['71En5htph8L', 'Samsung Galaxy M17 5G (Moonlight Silver, 8GB RAM, 128GB Storage), 50MP OIS Camera, 5000mAh Battery', 'mobiles', 4.2, 3612, 26499],
  ['61D9CLCf5KL', 'Lava Bold N4 Lite (Ghost Silver, 3GB RAM, 32GB Storage), 5000mAh Battery, Made in India', 'mobiles', 3.9, 918, 8399],
  // ── Electronics · Smartwatches (Indian wearable brands) ──────────────────
  ['819ZWX2Nm9L', 'Noise Diva Araya Smartwatch for Women, 1.32" AMOLED Display, BT Calling, 100+ Sports Modes, Metal Build', 'electronics', 4.3, 1204, 5499],
  ['61Cx3vx0mLL', 'Fire-Boltt Phoenix Pro 1.39" Bluetooth Calling Smartwatch, 120+ Sports Modes, SpO2 & Heart Rate Monitor', 'electronics', 3.9, 41230, 1299],
  ['61aIxLJVJCL', 'Noise Pulse 4 Max 1.96" AMOLED Display Smartwatch, AI Voice Assistant, BT Calling, Metallic Finish', 'electronics', 4.0, 8760, 2799],
  ['61ATaTpvEQL', 'Noise Twist Round 1.38" TFT Display Smartwatch, BT Calling, 100 Sports Modes, 7-Day Battery Life', 'electronics', 4.0, 15420, 1599],
  ['71JLQrCFF+L', 'boAt Wave Sigma 3 Smartwatch, 2.01" HD Display, BT Calling, 700+ Watch Faces, IP68 Water Resistant', 'electronics', 4.1, 9330, 1499],
  // ── Home & Kitchen · Mixer grinders ──────────────────────────────────────
  ['71S8pDT9EiL', 'Havells Prisma 750W Mixer Grinder, 4 Jars, 3 Speed with Pulse, Stainless Steel Blades, 5-Year Motor Warranty', 'home-kitchen', 4.1, 3820, 4290],
  ['71Swqb9mXvL', 'Philips HR7732 Mixer Grinder 1000W, 4 Jars, Double Ball Bearing Motor, Unique Modes for Different Textures', 'home-kitchen', 4.2, 9120, 7699],
  ['71nBpK+0uJL', 'Bosch TrueMixx Pro Mixer Grinder MGM8642BIN, 750W, 4 Jars, Stone Pounding Technology, Black', 'home-kitchen', 4.3, 4210, 6099],
  ['61P8ZSaqBHL', 'Sujata MG01 Mixer Grinder 1000W, 3 Jars, Double Ball Bearing Motor, 24000 RPM, 90 Min Non-Stop Running', 'home-kitchen', 4.6, 22400, 6690],
  ['61Cln50mffL', 'Bajaj Rex 500W Mixer Grinder, 3 Stainless Steel Jars, Multifunctional Blades, Nutri-Pro Feature', 'home-kitchen', 4.2, 18900, 2199],
  // ── Beauty & Personal Care · Face wash (Indian favourites) ───────────────
  ['518N3l4z1-L', 'Himalaya Purifying Neem Face Wash, 150ml, Soap-Free, Paraben & Phthalate Free, for Acne-Prone Skin', 'beauty', 4.3, 88400, 178],
  ['71gqGCYkFuL', 'Himalaya Hydrating Aloe Vera Face Wash, 200ml, Aloe Vera & Vitamin E, Creamy Gentle Cleanser', 'beauty', 4.1, 12600, 225],
  ['61ddBs1gCaL', 'CeraVe Foaming Cleanser for Normal to Oily Skin, 236ml, Dermatologist-Developed with Ceramides & Niacinamide', 'beauty', 4.3, 9800, 1116],
  ['71ZrMvjZXZL', 'Muuchstac Ocean Face Wash for Men, Fights Acne & Pimples, Oil Control, Brightens Skin, Pack of 3', 'beauty', 3.9, 21300, 290],
  // ── Fashion · Men's t-shirts ─────────────────────────────────────────────
  ['717qtxFpeaL', 'Jockey Mens Cotton Rich Regular Fit Half Sleeve Round Neck T-Shirt, Breathable Everyday Tee', 'fashion', 4.1, 6420, 999],
  ['514vCNWtZDL', 'ADRO Mens Regular Fit Cotton Half Sleeve Round Neck Solid Casual T-Shirt', 'fashion', 3.9, 3180, 599],
  ['41uhw1abTpL', 'TURMS Anti-Stain Mens Cotton Blend Half Sleeve Polo T-Shirt, Stretchable All-Day Comfort', 'fashion', 3.8, 940, 948],
  ['41T5wfyFb8L', 'AWG All Weather Gear Mens Dry-Fit Round Neck Half Sleeve Sports & Gym T-Shirt', 'fashion', 4.0, 2210, 699],
  ['61xTfKaqUlL', 'Lymio Mens Oversized Cotton Half Sleeve Round Neck Casual T-Shirt', 'fashion', 3.7, 5600, 399],
  // ── Books (India bestsellers) ────────────────────────────────────────────
  ['91Sy3S-198L', 'The Lost Bookshop: The most charming and uplifting novel of the year', 'books', 4.4, 48200, 352],
  ['919dIRLFTeL', "Broken Country: Amazon's Book of the Year, the Million-Copy Bestseller", 'books', 4.4, 15700, 431],
  ['71q6gvpgW8L', 'Greatest Works of Jane Austen (Set of 5 Books): Pride and Prejudice, Emma, Sense and Sensibility & more', 'books', 4.6, 3120, 749],
  ['41y8H3QmVqL', 'White Nights by Fyodor Dostoyevsky: A Timeless Story of Love, Longing & Solitude, Classic Russian Novella', 'books', 4.6, 8900, 107],
  ['71m8hR9ZUfL', 'Best of George Orwell Boxed Set (Animal Farm & 1984), Set of 2 Books', 'books', 4.7, 6740, 249],
  // ── Sports & Outdoors · Yoga mats ────────────────────────────────────────
  ['81q-gtF5lNL', 'Wiselife True Alignment Yoga Mat with Strap, 6mm Anti-Slip TPE, Eco-Friendly for Men & Women', 'sports', 4.2, 5240, 1182],
  ['61mx7nZOGnL', 'Lifelong Dual Color 6mm Anti-Slip TPE Yoga Mat for Gym Workout & Fitness, for Men & Women', 'sports', 4.2, 8630, 579],
  ['710zYiyB7XL', 'Permo Fitness Mat 12mm, Foldable High-Density TPE Multi-Purpose Yoga Mat with Carry Strap', 'sports', 4.1, 1120, 3999],
  ['51izPGxd0SL', 'Lifelong 4mm EVA Anti-Slip Yoga Mat for Gym Workout & Home Exercise, for Men & Women, Black', 'sports', 4.4, 6410, 550],
  // ── Toys & Games · Building blocks ───────────────────────────────────────
  ['81yuVZ1RhiL', 'Building Blocks Toy for Kids 5+, 200+ Piece STEM Construction Set, Creative Learning Play', 'toys', 4.1, 3420, 609],
  ['918VkKHJgvL', 'Magnetic Building Tiles for Kids, Set of 50 Big 75mm Tiles, Educational Stacking Blocks', 'toys', 4.3, 2180, 1799],
  ['71WasaFL9UL', 'Nesta Toys 115-Piece Wooden City Building Blocks Set, Alphabet A-Z, Numbers 0-9 & City Vehicles', 'toys', 4.3, 1240, 2298],
  ['714xdznLhsL', 'Skillmatics Brain Blocks, 3D Early STEM Building Blocks Game for Kids 4-8 Years', 'toys', 4.4, 2760, 948],
  ['61T829hkQLL', 'DIY Building Blocks Set for Kids, 200 Pieces Construction Toy with 32 Wheels, Build 8 Toy Vehicles', 'toys', 4.1, 4130, 299],
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
const BRANDS = ['boAt', 'Noise', 'Boult', 'Zebronics', 'Portronics', 'Lenovo', 'HP', 'ASUS', 'Apple', 'Hawkins', 'Prestige', 'Campus', 'Sparx', 'Boldfit', 'Impakto', 'Mamaearth', 'Minimalist', 'Lakme', 'Lotus', 'Novo', 'Storio', 'Eitheo', 'Flexnest', 'Burnlab', 'FitBox', 'Sparnod', 'OnePlus', 'Acer', 'Pigeon', 'Butterfly', 'ASIAN', 'The Derma Co', 'Aqualogica', 'Dot & Key', 'Smartivity', 'VEBETO', 'WireScorts', 'Humming Bird', 'Amazon Basics', 'Lifelong', 'Kore', 'RUBX',
  // Mobiles + enrichment brands (harvested from amazon.in)
  'Redmi', 'Samsung', 'realme', 'iQOO', 'Motorola', 'OPPO', 'Poco', 'Lava', 'Fire-Boltt', 'Havells', 'Philips', 'Bosch', 'Sujata', 'Bajaj', 'Himalaya', 'CeraVe', 'Muuchstac', 'Jockey', 'ADRO', 'TURMS', 'AWG', 'Lymio', 'Wiselife', 'Permo', 'Nesta', 'Skillmatics'];

function brandOf(title) {
  if (/^Amazon Brand Symactive/i.test(title)) return 'Symactive';
  for (const b of BRANDS) if (title.toLowerCase().startsWith(b.toLowerCase())) return b;
  return null;
}

const BULLETS = {
  mobiles: ['5G-ready with fast, lag-free everyday performance', 'Big, bright display for video, gaming & scrolling', 'All-day battery with fast charging support', 'Sharp AI cameras capture crisp photos day or night', 'Sleek, premium design that feels great in hand'],
  electronics: ['Immersive sound with deep, punchy bass', 'Bluetooth 5.3 stable wireless connection up to 10 m', 'Built-in mic with ENx tech for clear calls', 'Fast USB-C charging — 10 min for hours of play', 'Comfortable cushions for all-day wear'],
  computers: ['Snappy everyday performance for work and study', 'Crisp Full-HD anti-glare display', 'All-day battery for work on the go', 'Fast SSD storage boots in seconds', 'Windows 11 with lifetime validity'],
  'home-kitchen': ['ISI-marked, made in India for everyday cooking', 'Works on gas and induction cooktops', 'Sturdy build with a secure locking lid', 'Even heat for faster, fuel-saving cooking', 'Backed by a manufacturer warranty'],
  fashion: ['Lightweight, breathable mesh upper keeps feet cool', 'Cushioned sole absorbs impact on every stride', 'Durable anti-skid outsole grips every surface', 'Lace-up fit for daily running, gym and walking', 'Everyday comfort for Indian roads and weather'],
  beauty: ['Made for Indian skin and climate', 'Dermatologically tested, gentle for daily use', 'Free from parabens, sulphates and mineral oil', 'Deeply hydrates for a healthy, natural glow', 'Suitable for all skin types'],
  books: ['A gripping read you won’t be able to put down', 'Print length crafted for immersive weekend reading', 'A reader-favourite pick with rave reviews', 'Beautifully written and impossible to forget'],
  toys: ['Sparks imaginative, screen-free play', 'Made from kid-safe, durable materials', 'Builds learning, creativity and motor skills', 'A great return-gift or birthday present', 'Recommended for hours of independent fun'],
  sports: ['Adjustable weight adapts as your strength grows', 'Space-saving design for a home gym', 'Secure locking mechanism for safe lifting', 'Durable, non-slip grip handle', 'Ideal for home strength training'],
};

// Smartwatches live under `electronics` but the headphone bullets don't fit —
// swap in watch-specific bullets when the title reads like a smartwatch.
const WATCH_BULLETS = ['Bright display with hundreds of customisable watch faces', 'Bluetooth calling with built-in mic & speaker', 'Tracks heart rate, SpO2, sleep & 100+ sports modes', 'Multi-day battery life on a single charge', 'Water-resistant, built for workouts and daily wear'];
const isSmartwatch = (title) => /smart\s*watch|smartwatch/i.test(title);

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

    const bset = isSmartwatch(title) ? WATCH_BULLETS : BULLETS[category];
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
