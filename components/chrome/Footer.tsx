import { Wordmark } from './Wordmark';

export interface FooterColumn { heading: string; links: string[] }
export interface FooterSubBrand { name: string; blurb: string }
export interface FooterLocale { language: string; currency?: string; country: string }
export interface FooterProps {
  storeName: string;
  tld?: string;
  columns: FooterColumn[];
  locale: FooterLocale;
  subBrands: FooterSubBrand[];
  legal: string[];
  copyright: string;
}

/** Back-to-top band → 4 link columns → locale bar → sub-brand grid → legal line
 *  (mirrors the real amazon.com / amazon.in footer stack; design.md §5 Footer). */
export function Footer({ storeName, tld = 'com', columns, locale, subBrands, legal, copyright }: FooterProps) {
  return (
    <footer className="mt-8 text-white">
      <a href="#top" className="block bg-nav-back py-[15px] text-center text-[13px] font-bold hover:bg-[#485769]">Back to top</a>

      <div className="bg-nav-main">
        <div className="mx-auto grid max-w-[1000px] gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
          {columns.map((c) => (
            <div key={c.heading}>
              <h3 className="mb-2 text-[16px] font-bold">{c.heading}</h3>
              <ul className="space-y-2">{c.links.map((l) => (<li key={l}><a href="#" className="text-[14px] text-line-2 hover:underline">{l}</a></li>))}</ul>
            </div>
          ))}
        </div>

        {/* logo + locale pills (language / currency / country) */}
        <div className="border-t border-[#3A4553] py-8">
          <div className="mx-auto flex max-w-[1000px] flex-col items-center gap-5 px-4">
            <Wordmark tld={tld} />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <LocalePill>🌐 {locale.language}</LocalePill>
              {locale.currency ? <LocalePill>{locale.currency}</LocalePill> : null}
              <LocalePill>{locale.country}</LocalePill>
            </div>
          </div>
        </div>
      </div>

      {/* sub-brand grid — Amazon's family of companies */}
      <div className="bg-nav-bottom">
        <div className="mx-auto grid max-w-[820px] grid-cols-2 gap-x-6 gap-y-6 px-4 py-9 text-center sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {subBrands.map((b) => (
            <a key={b.name} href="#" className="group block leading-tight">
              <span className="block text-[12px] font-bold text-white group-hover:underline">{b.name}</span>
              <span className="mt-1 block text-[11px] text-[#DDD]">{b.blurb}</span>
            </a>
          ))}
        </div>

        {/* legal links + copyright */}
        <div className="border-t border-[#3A4553] px-4 py-7 text-center">
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-line-2">
            {legal.map((l) => (<li key={l}><a href="#" className="hover:underline">{l}</a></li>))}
          </ul>
          <p className="mt-2 text-[12px] text-[#999]">{copyright}</p>
        </div>

        <div className="px-4 pb-7 text-center text-[11px] text-[#767676]">
          Unofficial demo clone of {storeName} built as a coding exercise — not affiliated with, endorsed by, or connected to Amazon.com, Inc. Product names, logos, and images belong to their respective owners.
        </div>
      </div>
    </footer>
  );
}

function LocalePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[3px] border border-[#8D949E] px-3 py-2 text-[13px] text-white hover:border-white">
      {children}
    </span>
  );
}
