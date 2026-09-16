export interface FacetGroup { heading: string; options: string[] }
/** 241px facet rail shell — checkbox groups; wiring to real search is a later phase (design.md §5 Facet rail). */
export function FacetRail({ groups }: { groups: FacetGroup[] }) {
  return (
    <aside className="w-[241px] shrink-0 pr-4 text-[14px]">
      {groups.map((g) => (
        <div key={g.heading} className="mb-4">
          <h3 className="mb-1 font-bold text-ink">{g.heading}</h3>
          <ul>{g.options.map((o) => (<li key={o}><label className="flex items-center gap-2 py-0.5 hover:text-link-hover"><input type="checkbox" className="accent-[#007185]" /> {o}</label></li>))}</ul>
        </div>
      ))}
    </aside>
  );
}
