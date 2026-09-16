// Prime Video storefront content. Like the real service, the catalog differs by
// marketplace: amazon.com surfaces US/Hollywood originals and movies, amazon.in
// surfaces Indian originals, Bollywood blockbusters and regional-language hits.
// Posters are rendered as deterministic gradient art (hue) so there are no
// external image dependencies. Unofficial demo clone — not affiliated with Amazon.

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
}
export interface PVRail {
  heading: string;
  titles: PVTitle[];
}
export interface PVContent {
  hero: { title: string; blurb: string; meta: string; tag: string; hue: number; poster?: string };
  rails: PVRail[];
}

const US: PVContent = {
  hero: {
    title: 'The Boys',
    blurb: 'Superheroes are as popular as ever — but their fame has gone to their heads. A group of vigilantes sets out to take down corrupt Supes.',
    meta: 'Prime Original · Action · Drama · 18+',
    tag: 'Included with Prime',
    hue: 352,
    poster: '/prime/the-boys.jpg',
  },
  rails: [
    {
      heading: 'Prime Originals',
      titles: [
        { title: 'Reacher', meta: '2024 · Action · 16+', imdb: 8.1, tag: 'Prime', hue: 24, poster: '/prime/reacher.jpg' },
        { title: 'Fallout', meta: '2024 · Sci-Fi · 18+', imdb: 8.4, tag: 'Prime', hue: 46, poster: '/prime/fallout.jpg' },
        { title: 'The Marvelous Mrs. Maisel', meta: 'Comedy · 16+', imdb: 8.7, tag: 'Prime', hue: 330, poster: '/prime/the-marvelous-mrs-maisel.jpg' },
        { title: 'Jack Ryan', meta: 'Thriller · 16+', imdb: 8.0, tag: 'Prime', hue: 210, poster: '/prime/jack-ryan.jpg' },
        { title: 'Invincible', meta: 'Animation · 18+', imdb: 8.7, tag: 'Prime', hue: 140, poster: '/prime/invincible.jpg' },
        { title: 'The Wheel of Time', meta: 'Fantasy · 16+', imdb: 7.1, tag: 'Prime', hue: 265, poster: '/prime/the-wheel-of-time.jpg' },
        { title: 'The Terminal List', meta: 'Thriller · 18+', imdb: 8.0, tag: 'Prime', hue: 200, poster: '/prime/the-terminal-list.jpg' },
      ],
    },
    {
      heading: 'Movies we think you’ll like',
      titles: [
        { title: 'Road House', meta: '2024 · Action · R', imdb: 6.7, hue: 18, poster: '/prime/road-house.jpg' },
        { title: 'The Idea of You', meta: '2024 · Romance · R', imdb: 6.4, hue: 320, poster: '/prime/the-idea-of-you.jpg' },
        { title: 'Saltburn', meta: '2023 · Drama · R', imdb: 7.0, hue: 285, poster: '/prime/saltburn.jpg' },
        { title: 'Air', meta: '2023 · Drama · R', imdb: 7.4, hue: 8, poster: '/prime/air.jpg' },
        { title: 'Argylle', meta: '2024 · Action · PG-13', imdb: 5.6, hue: 250, poster: '/prime/argylle.jpg' },
        { title: 'The Tomorrow War', meta: '2021 · Sci-Fi · PG-13', imdb: 6.5, hue: 190, poster: '/prime/the-tomorrow-war.jpg' },
      ],
    },
    {
      heading: 'Popular TV shows',
      titles: [
        { title: 'The Rings of Power', meta: 'Fantasy · 16+', imdb: 6.9, tag: 'Prime', hue: 42, poster: '/prime/the-rings-of-power.jpg' },
        { title: 'Mr. & Mrs. Smith', meta: 'Action · 16+', imdb: 7.4, tag: 'Prime', hue: 356, poster: '/prime/mr-and-mrs-smith.jpg' },
        { title: 'Gen V', meta: 'Sci-Fi · 18+', imdb: 7.8, tag: 'Prime', hue: 300, poster: '/prime/gen-v.jpg' },
        { title: 'Bosch', meta: 'Crime · 16+', imdb: 8.5, tag: 'Prime', hue: 215, poster: '/prime/bosch.jpg' },
        { title: 'Upload', meta: 'Comedy · 16+', imdb: 8.0, tag: 'Prime', hue: 168, poster: '/prime/upload.jpg' },
        { title: 'Cross', meta: '2024 · Crime · 18+', imdb: 7.3, tag: 'Prime', hue: 268, poster: '/prime/cross.jpg' },
      ],
    },
  ],
};

const IN: PVContent = {
  hero: {
    title: 'The Family Man',
    blurb: 'A middle-class man secretly works as an intelligence officer for the TASC, balancing the demands of his job with the troubles of his family life.',
    meta: 'Amazon Original · Action · Drama · 16+',
    tag: 'Included with Prime',
    hue: 210,
    poster: '/prime/the-family-man.jpg',
  },
  rails: [
    {
      heading: 'Amazon Originals',
      titles: [
        { title: 'Mirzapur', meta: 'Crime · Drama · 18+', imdb: 8.4, tag: 'Prime', hue: 26, poster: '/prime/mirzapur.jpg' },
        { title: 'Panchayat', meta: 'Comedy · Drama · 13+', imdb: 8.9, tag: 'Prime', hue: 96, poster: '/prime/panchayat.jpg' },
        { title: 'Made in Heaven', meta: 'Drama · 18+', imdb: 8.3, tag: 'Prime', hue: 42, poster: '/prime/made-in-heaven.jpg' },
        { title: 'Paatal Lok', meta: 'Crime · Thriller · 18+', imdb: 7.5, tag: 'Prime', hue: 205, poster: '/prime/paatal-lok.jpg' },
        { title: 'Farzi', meta: 'Crime · Thriller · 16+', imdb: 8.3, tag: 'Prime', hue: 152, poster: '/prime/farzi.jpg' },
        { title: 'Guns & Gulaabs', meta: 'Crime · Comedy · 16+', imdb: 8.0, tag: 'Prime', hue: 340, poster: '/prime/guns-and-gulaabs.jpg' },
        { title: 'Bandish Bandits', meta: 'Musical · Drama · 13+', imdb: 8.5, tag: 'Prime', hue: 278, poster: '/prime/bandish-bandits.jpg' },
      ],
    },
    {
      heading: 'Blockbuster movies',
      titles: [
        { title: 'Jawan', meta: '2023 · Hindi · Action · 16+', imdb: 6.9, hue: 0, poster: '/prime/jawan.jpg' },
        { title: 'Pathaan', meta: '2023 · Hindi · Action · 16+', imdb: 5.9, hue: 222, poster: '/prime/pathaan.jpg' },
        { title: '12th Fail', meta: '2023 · Hindi · Drama · 13+', imdb: 8.8, hue: 36, poster: '/prime/12th-fail.jpg' },
        { title: 'Rocky Aur Rani Kii Prem Kahaani', meta: '2023 · Hindi · Romance · 13+', imdb: 6.5, hue: 328, poster: '/prime/rocky-aur-rani-kii-prem-kahaani.jpg' },
        { title: 'Jailer', meta: '2023 · Tamil · Action · 16+', imdb: 6.7, hue: 264, poster: '/prime/jailer.jpg' },
        { title: 'Animal', meta: '2023 · Hindi · Crime · 18+', imdb: 6.2, hue: 8, poster: '/prime/animal.jpg' },
      ],
    },
    {
      heading: 'Popular regional cinema',
      titles: [
        { title: 'Kantara', meta: 'Kannada · Action · 16+', imdb: 8.2, hue: 30, poster: '/prime/kantara.jpg' },
        { title: 'RRR', meta: 'Telugu · Action · 13+', imdb: 7.8, hue: 18, poster: '/prime/rrr.jpg' },
        { title: 'KGF: Chapter 2', meta: 'Kannada · Action · 16+', imdb: 8.3, hue: 44, poster: '/prime/kgf-chapter-2.jpg' },
        { title: 'Ponniyin Selvan: I', meta: 'Tamil · Epic · 13+', imdb: 7.6, hue: 200, poster: '/prime/ponniyin-selvan-i.jpg' },
        { title: 'Vikram', meta: 'Tamil · Action · 18+', imdb: 8.2, hue: 348, poster: '/prime/vikram.jpg' },
        { title: 'Kaithi', meta: 'Tamil · Thriller · 16+', imdb: 8.4, hue: 150, poster: '/prime/kaithi.jpg' },
      ],
    },
  ],
};

export function primeVideoContent(market: 'US' | 'IN'): PVContent {
  return market === 'IN' ? IN : US;
}
