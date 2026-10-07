import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';

vi.mock('server-only', () => ({}));
import { RankedPage } from './RankedPage';

const categories = [{ slug: 'kitchen', name: 'Kitchen' }, { slug: 'audio', name: 'Audio' }] as Parameters<typeof RankedPage>[0]['categories'];

it('links the charts to each other, in the same department, marking the one shown', () => {
  render(
    <RankedPage
      store={amazon}
      basePath="/most-wished-for"
      kicker="Most wished for"
      title="Most wished for"
      lede="What shoppers are adding to their lists."
      categories={categories}
      active="kitchen"
      items={[]}
      saved={new Set()}
      ranked
    />,
  );
  const charts = within(screen.getByRole('navigation', { name: 'Charts' }));
  expect(charts.getByRole('link', { name: 'Bestsellers' })).toHaveAttribute('href', '/bestsellers?c=kitchen');
  expect(charts.getByRole('link', { name: 'New & trending' })).toHaveAttribute('href', '/new-releases?c=kitchen');
  const here = charts.getByRole('link', { name: 'Most wished for' });
  expect(here).toHaveAttribute('aria-current', 'page');
  expect(charts.getByRole('link', { name: 'Bestsellers' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('heading', { name: 'Most wished for in Kitchen' })).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: 'Departments' })).getByRole('link', { name: 'Audio' })).toHaveAttribute('href', '/most-wished-for?c=audio');
});
