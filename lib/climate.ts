/**
 * Climate Pledge Friendly, as on Amazon: a product with at least one sustainability certification
 * carries the badge, can be filtered for in search, and lists its certifications on its page. The
 * certifications are the store's own (`products.climate`, checked against `CLIMATE_CERTS` by the
 * database); a demo's, not a real certifier's.
 */

export const CLIMATE_CERTS = ['compact', 'carbon', 'recycled', 'organic', 'energy', 'forest', 'safer'] as const;

export type ClimateCert = (typeof CLIMATE_CERTS)[number];

export function isClimateCert(v: unknown): v is ClimateCert {
  return (CLIMATE_CERTS as readonly unknown[]).includes(v);
}

/** Each certification: its name, and what it means for the product. */
export const CLIMATE_CERT: Record<ClimateCert, { name: string; desc: string }> = {
  compact: {
    name: 'Compact by Design',
    desc: 'Packed more efficiently, with less air and water, so more ships in each load and less packaging is used.',
  },
  carbon: {
    name: 'Carbon reduced',
    desc: 'The maker has measured this product’s carbon footprint and cut it, year on year.',
  },
  recycled: {
    name: 'Recycled materials',
    desc: 'Made with a verified share of recycled content, tracked from the recycler to the finished product.',
  },
  organic: {
    name: 'Organic content',
    desc: 'Made with organically grown materials, certified from the farm through processing.',
  },
  energy: {
    name: 'Energy efficient',
    desc: 'Uses meaningfully less energy than comparable products, by independent testing.',
  },
  forest: {
    name: 'Responsibly sourced wood and paper',
    desc: 'Its wood, paper or pulp comes from forests managed to protect biodiversity and the people who work in them.',
  },
  safer: {
    name: 'Safer chemicals',
    desc: 'Made without a list of chemicals of concern to people and the environment, checked by an independent lab.',
  },
};

/** The certifications a product lists, known ones only, in `CLIMATE_CERTS` order. */
export function climateCerts(v: unknown): ClimateCert[] {
  const given = Array.isArray(v) ? v : [];
  return CLIMATE_CERTS.filter((c) => given.includes(c));
}
