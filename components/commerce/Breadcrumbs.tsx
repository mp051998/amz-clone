export interface Crumb { label: string; href?: string }
/** 12px trail with › separators (design.md §5 Breadcrumbs). */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12px] text-ink-2">
      {trail.map((c, i) => (
        <span key={c.label}>
          {i > 0 ? <span className="mx-1">›</span> : null}
          {c.href ? <a href={c.href} className="hover:text-link-hover hover:underline">{c.label}</a> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
