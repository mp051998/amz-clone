import { CLIMATE_CERT, type ClimateCert } from '@/lib/climate';
import { cn } from '../lib/cn';
import { IconLeaf } from '../icons';

/** "Climate Pledge Friendly", with its leaf: on a search result and under a product's title (a link to its certifications there). */
export function ClimateBadge({ href, className }: { href?: string; className?: string }) {
  const body = (
    <>
      <IconLeaf width={16} height={16} />
      <span>Climate Pledge Friendly</span>
    </>
  );
  const cls = cn('inline-flex items-center gap-1 self-start text-[13px] font-semibold text-good-strong', className);
  return href ? (
    <a href={href} className={cn(cls, 'no-underline hover:underline')}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** A product's "Sustainability features": each certification it carries, and what it means. */
export function ClimateFeatures({ certs }: { certs: ClimateCert[] }) {
  return (
    <section id="climate" aria-labelledby="climate-h" className="flex max-w-[860px] flex-col gap-3">
      <h2 id="climate-h" className="m-0 text-[22px] font-semibold">Sustainability features</h2>
      <p className="m-0 flex items-center gap-1.5 text-[14px] text-ink-2">
        <ClimateBadge />
        <span>· certified for {certs.length === 1 ? 'one sustainability practice' : `${certs.length} sustainability practices`}</span>
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {certs.map((c) => (
          <li key={c} className="flex flex-col gap-0.5 rounded-input border border-line p-3">
            <span className="text-[15px] font-semibold">{CLIMATE_CERT[c].name}</span>
            <span className="text-[14px] leading-snug text-ink-2">{CLIMATE_CERT[c].desc}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12px] text-ink-3">Certifications are this store&apos;s own, for demonstration.</p>
    </section>
  );
}
