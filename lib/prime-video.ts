// Prime Video storefront content. Like the real service, the catalog differs by
// marketplace: amazon.com surfaces US/Hollywood originals and movies, amazon.in
// surfaces Indian originals, Bollywood blockbusters and regional-language hits.
// Posters (portrait) live under /public/prime; wide 16:9 backdrops under
// /public/prime/backdrops (same slug) power the big previews, falling back to the
// hue gradient when missing. Unofficial demo clone — not affiliated with Amazon.

export interface PVTitle {
  title: string;
  /** e.g. "2024 · Action · 16+" */
  meta: string;
  imdb?: number;
  /** small ribbon, e.g. "Prime" or "Included with Prime" */
  tag?: string;
  hue: number;
  /** self-hosted poster art under /public/prime; falls back to the hue gradient if missing. */
  poster?: string;
  /** one-line synopsis shown on the detail/spotlight cards. */
  desc?: string;
}
export interface PVRail {
  heading: string;
  titles: PVTitle[];
}
export interface PVContent {
  hero: { title: string; blurb: string; meta: string; tag: string; hue: number; poster?: string };
  rails: PVRail[];
}

/** wide backdrop path for a title/hero, derived from its poster slug (same name under
 *  /backdrops). Returns undefined when there's no poster to derive from. */
export function backdropFor(posterPath?: string): string | undefined {
  return posterPath ? posterPath.replace('/prime/', '/prime/backdrops/') : undefined;
}

const US: PVContent = {
  hero: {
    title: 'The Boys',
    blurb: 'Superheroes are as popular as ever — but their fame has gone to their heads. A group of vigilantes sets out to take down corrupt Supes who abuse their powers.',
    meta: 'Prime Original · Action · Drama · 18+',
    tag: 'Included with Prime',
    hue: 352,
    poster: '/prime/the-boys.jpg',
  },
  rails: [
    {
      heading: 'Prime Originals',
      titles: [
        { title: 'Reacher', meta: '2024 · Action · 16+', imdb: 8.1, tag: 'Prime', hue: 24, poster: '/prime/reacher.jpg', desc: 'Ex-military investigator Jack Reacher roams America, dispensing justice with his fists and a razor-sharp mind.' },
        { title: 'Fallout', meta: '2024 · Sci-Fi · 18+', imdb: 8.4, tag: 'Prime', hue: 46, poster: '/prime/fallout.jpg', desc: 'In a world rebuilt from nuclear ash, a sheltered vault dweller ventures to the surface and confronts its brutal chaos.' },
        { title: 'The Marvelous Mrs. Maisel', meta: 'Comedy · 16+', imdb: 8.7, tag: 'Prime', hue: 330, poster: '/prime/the-marvelous-mrs-maisel.jpg', desc: 'A 1950s Upper West Side housewife discovers a sharp talent for stand-up comedy and chases the spotlight.' },
        { title: 'Jack Ryan', meta: 'Thriller · 16+', imdb: 8.0, tag: 'Prime', hue: 210, poster: '/prime/jack-ryan.jpg', desc: 'A CIA analyst is thrust from behind his desk into deadly field operations across the globe.' },
        { title: 'Invincible', meta: 'Animation · 18+', imdb: 8.7, tag: 'Prime', hue: 140, poster: '/prime/invincible.jpg', desc: "A teenager inherits superpowers from his father — the world's greatest hero — and learns the brutal cost of the cape." },
        { title: 'The Wheel of Time', meta: 'Fantasy · 16+', imdb: 7.1, tag: 'Prime', hue: 265, poster: '/prime/the-wheel-of-time.jpg', desc: 'A powerful sorceress leads five villagers on a perilous journey to find the one prophesied to save — or break — the world.' },
        { title: 'The Terminal List', meta: 'Thriller · 18+', imdb: 8.0, tag: 'Prime', hue: 200, poster: '/prime/the-terminal-list.jpg', desc: 'A Navy SEAL uncovers a conspiracy behind the ambush that wiped out his platoon, and hunts those responsible.' },
      ],
    },
    {
      heading: 'Movies we think you’ll like',
      titles: [
        { title: 'Road House', meta: '2024 · Action · R', imdb: 6.7, hue: 18, poster: '/prime/road-house.jpg', desc: 'An ex-UFC fighter takes a bouncer job at a rowdy Florida Keys roadhouse and finds far more than bar brawls.' },
        { title: 'The Idea of You', meta: '2024 · Romance · R', imdb: 6.4, hue: 320, poster: '/prime/the-idea-of-you.jpg', desc: "A single mother unexpectedly falls for the much-younger frontman of the world's hottest boy band." },
        { title: 'Saltburn', meta: '2023 · Drama · R', imdb: 7.0, hue: 285, poster: '/prime/saltburn.jpg', desc: "A student's obsession with an aristocratic classmate pulls him into a summer of privilege and dark desire." },
        { title: 'Air', meta: '2023 · Drama · R', imdb: 7.4, hue: 8, poster: '/prime/air.jpg', desc: 'The true story of how Nike gambled everything to sign a rookie Michael Jordan and change sports forever.' },
        { title: 'Argylle', meta: '2024 · Action · PG-13', imdb: 5.6, hue: 250, poster: '/prime/argylle.jpg', desc: "A spy novelist's fictional plots start colliding with real-world espionage — and she becomes the target." },
        { title: 'The Tomorrow War', meta: '2021 · Sci-Fi · PG-13', imdb: 6.5, hue: 190, poster: '/prime/the-tomorrow-war.jpg', desc: 'A father is drafted to fight a future alien war and must save humanity before time runs out.' },
      ],
    },
    {
      heading: 'Popular TV shows',
      titles: [
        { title: 'The Rings of Power', meta: 'Fantasy · 16+', imdb: 6.9, tag: 'Prime', hue: 42, poster: '/prime/the-rings-of-power.jpg', desc: 'Millennia before the Hobbit, heroes confront the long-feared re-emergence of evil across Middle-earth.' },
        { title: 'Mr. & Mrs. Smith', meta: 'Action · 16+', imdb: 7.4, tag: 'Prime', hue: 356, poster: '/prime/mr-and-mrs-smith.jpg', desc: 'Two strangers become married spy partners, juggling deadly missions and a very real relationship.' },
        { title: 'Gen V', meta: 'Sci-Fi · 18+', imdb: 7.8, tag: 'Prime', hue: 300, poster: '/prime/gen-v.jpg', desc: 'At an elite college for young superheroes, ambition, secrets and rivalry quickly turn lethal.' },
        { title: 'Bosch', meta: 'Crime · 16+', imdb: 8.5, tag: 'Prime', hue: 215, poster: '/prime/bosch.jpg', desc: 'A relentless LAPD homicide detective bends the rules on the belief that everybody counts or nobody counts.' },
        { title: 'Upload', meta: 'Comedy · 16+', imdb: 8.0, tag: 'Prime', hue: 168, poster: '/prime/upload.jpg', desc: 'In a near future, people upload their consciousness into luxury digital afterlives — for the right price.' },
        { title: 'Cross', meta: '2024 · Crime · 18+', imdb: 7.3, tag: 'Prime', hue: 268, poster: '/prime/cross.jpg', desc: 'Detective Alex Cross hunts a killer who is targeting him and everyone he loves.' },
      ],
    },
  ],
};

const IN: PVContent = {
  hero: {
    title: 'The Family Man',
    blurb: 'A middle-class man secretly works as an intelligence officer for the TASC, balancing the impossible demands of his job with the everyday troubles of his family life.',
    meta: 'Amazon Original · Action · Drama · 16+',
    tag: 'Included with Prime',
    hue: 210,
    poster: '/prime/the-family-man.jpg',
  },
  rails: [
    {
      heading: 'Amazon Originals',
      titles: [
        { title: 'Mirzapur', meta: 'Crime · Drama · 18+', imdb: 8.4, tag: 'Prime', hue: 26, poster: '/prime/mirzapur.jpg', desc: 'In a lawless town ruled by the mafia don of guns and carpets, two brothers are pulled into a bloody power struggle.' },
        { title: 'Panchayat', meta: 'Comedy · Drama · 13+', imdb: 8.9, tag: 'Prime', hue: 96, poster: '/prime/panchayat.jpg', desc: 'An engineering grad reluctantly takes a village panchayat secretary job and slowly finds meaning in small-town life.' },
        { title: 'Made in Heaven', meta: 'Drama · 18+', imdb: 8.3, tag: 'Prime', hue: 42, poster: '/prime/made-in-heaven.jpg', desc: 'Two Delhi wedding planners stage lavish big-fat Indian weddings while hiding their own messy private lives.' },
        { title: 'Paatal Lok', meta: 'Crime · Thriller · 18+', imdb: 7.5, tag: 'Prime', hue: 205, poster: '/prime/paatal-lok.jpg', desc: "A weary cop's routine case spirals into a dark journey through India's underbelly and its corridors of power." },
        { title: 'Farzi', meta: 'Crime · Thriller · 16+', imdb: 8.3, tag: 'Prime', hue: 152, poster: '/prime/farzi.jpg', desc: 'A gifted artist is drawn into a counterfeit-currency racket, chased by a firebrand task-force officer.' },
        { title: 'Guns & Gulaabs', meta: 'Crime · Comedy · 16+', imdb: 8.0, tag: 'Prime', hue: 340, poster: '/prime/guns-and-gulaabs.jpg', desc: "In the 90s, a lovestruck mechanic gets tangled in a small town's chaotic and comic drug trade." },
        { title: 'Bandish Bandits', meta: 'Musical · Drama · 13+', imdb: 8.5, tag: 'Prime', hue: 278, poster: '/prime/bandish-bandits.jpg', desc: 'A classical-music prodigy and a chart-topping pop star collide in a romance across two very different worlds of song.' },
      ],
    },
    {
      heading: 'Blockbuster movies',
      titles: [
        { title: 'Jawan', meta: '2023 · Hindi · Action · 16+', imdb: 6.9, hue: 0, poster: '/prime/jawan.jpg', desc: "A man's vendetta pits him against corruption, aided by an army of women, in a high-octane double role." },
        { title: 'Pathaan', meta: '2023 · Hindi · Action · 16+', imdb: 5.9, hue: 222, poster: '/prime/pathaan.jpg', desc: 'An exiled spy returns to stop a rogue agent from unleashing a devastating attack on India.' },
        { title: '12th Fail', meta: '2023 · Hindi · Drama · 13+', imdb: 8.8, hue: 36, poster: '/prime/12th-fail.jpg', desc: 'The true story of an IPS aspirant who refuses to quit against crushing odds and repeated failure.' },
        { title: 'Rocky Aur Rani Kii Prem Kahaani', meta: '2023 · Hindi · Romance · 13+', imdb: 6.5, hue: 328, poster: '/prime/rocky-aur-rani-kii-prem-kahaani.jpg', desc: 'Two lovers from clashing families swap households to prove their romance can survive tradition.' },
        { title: 'Jailer', meta: '2023 · Tamil · Action · 16+', imdb: 6.7, hue: 264, poster: '/prime/jailer.jpg', desc: 'A retired jailer is pulled back into brutal violence when a ruthless gang threatens his family.' },
        { title: 'Animal', meta: '2023 · Hindi · Crime · 18+', imdb: 6.2, hue: 8, poster: '/prime/animal.jpg', desc: "A son's fierce devotion to his father erupts into a savage, sprawling cycle of violence." },
      ],
    },
    {
      heading: 'Popular regional cinema',
      titles: [
        { title: 'Kantara', meta: 'Kannada · Action · 16+', imdb: 8.2, hue: 30, poster: '/prime/kantara.jpg', desc: 'In a coastal village, a man clashes with authority over land, faith and the divine guardian of the forest.' },
        { title: 'RRR', meta: 'Telugu · Action · 13+', imdb: 7.8, hue: 18, poster: '/prime/rrr.jpg', desc: "Two revolutionaries' fiery friendship ignites a thunderous rebellion against British colonial rule." },
        { title: 'KGF: Chapter 2', meta: 'Kannada · Action · 16+', imdb: 8.3, hue: 44, poster: '/prime/kgf-chapter-2.jpg', desc: "A ruthless outlaw's rise to rule the Kolar gold fields draws deadly enemies from every side." },
        { title: 'Ponniyin Selvan: I', meta: 'Tamil · Epic · 13+', imdb: 7.6, hue: 200, poster: '/prime/ponniyin-selvan-i.jpg', desc: 'Palace intrigue and betrayal threaten the mighty Chola empire in this sweeping historical epic.' },
        { title: 'Vikram', meta: 'Tamil · Action · 18+', imdb: 8.2, hue: 348, poster: '/prime/vikram.jpg', desc: 'A black-ops agent hunts a masked gang and uncovers a web that ties back to his own buried past.' },
        { title: 'Kaithi', meta: 'Tamil · Thriller · 16+', imdb: 8.4, hue: 150, poster: '/prime/kaithi.jpg', desc: 'A just-released prisoner must drive a truck of wounded cops through a night of relentless ambush.' },
      ],
    },
  ],
};

export function primeVideoContent(market: 'US' | 'IN'): PVContent {
  return market === 'IN' ? IN : US;
}
