export default function Home() {
  return (
    <main className="mx-auto max-w-[1200px] p-8">
      <h1 className="text-[24px] font-bold text-ink">amz-clone — toolchain check</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-card bg-nav-belt px-3 py-2 text-white">nav-belt</span>
        <span className="rounded-card bg-nav-main px-3 py-2 text-white">nav-main</span>
        <span className="rounded-card bg-brand-search px-3 py-2 text-ink">brand-search</span>
        <span className="rounded-card bg-brand-orange px-3 py-2 text-white">brand-orange</span>
        <span className="rounded-card border border-line px-3 py-2 text-ink-2">ink-2 / line</span>
      </div>
    </main>
  );
}
