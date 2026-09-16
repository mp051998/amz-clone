import { AppShell } from '@/components/AppShell';

export default function NotFound() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-4 py-20 text-center">
        <p className="text-[52px] font-bold text-nav-main">404</p>
        <h1 className="mt-2 text-[24px] font-bold text-ink">Looking for something?</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          We&apos;re sorry. The web address you entered is not a functioning page on our site.
        </p>
        <a href="/" className="mt-5 inline-flex h-[36px] items-center rounded-pill bg-cta-yellow px-6 text-[14px] text-ink hover:bg-cta-yellow-hover">
          Go to Amazon.com&apos;s home page
        </a>
      </div>
    </AppShell>
  );
}
