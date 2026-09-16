import { Wordmark } from './Wordmark';

export interface FooterColumn { heading: string; links: string[] }
export interface FooterProps {
  storeName: string;
  tld?: string;
  columns: FooterColumn[];
}

/** Back-to-top band + 4 link columns + brand row (design.md §5 Footer). */
export function Footer({ storeName, tld = 'com', columns }: FooterProps) {
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
        <div className="border-t border-[#3A4553] py-6 text-center"><Wordmark tld={tld} /></div>
      </div>
      <div className="bg-nav-bottom px-4 py-6 text-center text-[12px] text-line-2">
        Unofficial demo clone built as a coding exercise — not affiliated with, endorsed by, or connected to Amazon.com, Inc. Product names, logos, and images belong to their respective owners.
      </div>
    </footer>
  );
}
