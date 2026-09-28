import { AppShell } from '@/components/AppShell';
import { Page, PageHead } from '@/components/brand/Page';
import { buttonClasses } from '@/components/primitives/Button';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export default async function NotFound() {
  const store = await getMarketplace();
  const sp = (p: string) => storePath(store, p);
  return (
    <AppShell>
      <Page className="min-h-[50vh]">
        <PageHead
          kicker="404 · page not found"
          title="We couldn't find that page"
          actions={
            <>
              <a href={sp('/')} className={buttonClasses({ variant: 'primary' })}>Back to the store</a>
              <a href={sp('/deals')} className={buttonClasses({ variant: 'secondary' })}>Today&apos;s deals</a>
              <a href={sp('/customer-service')} className={buttonClasses({ variant: 'secondary' })}>Get help</a>
            </>
          }
        >
          The link may be old or mistyped. Search for what you need from the bar above, or start again from the home page.
        </PageHead>
      </Page>
    </AppShell>
  );
}
