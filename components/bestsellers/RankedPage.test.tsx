import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';

vi.mock('server-only', () => ({}));
vi.mock('@/components/decision/Compare', () => ({ CompareToggle: () => null }));
vi.mock('@/components/decision/SaveButton', () => ({ SaveButton: () => null }));
vi.mock('@/components/deals/QuickAdd', () => ({ QuickAdd: () => null }));
import { RankedPage } from './RankedPage';

afterEach(cleanup);

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
  expect(charts.getByRole('link', { name: 'Movers & shakers' })).toHaveAttribute('href', '/movers-and-shakers?c=kitchen');
  expect(charts.getByRole('link', { name: 'Gift ideas' })).toHaveAttribute('href', '/gift-ideas?c=kitchen');
  const here = charts.getByRole('link', { name: 'Most wished for' });
  expect(here).toHaveAttribute('aria-current', 'page');
  expect(charts.getByRole('link', { name: 'Bestsellers' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('heading', { name: 'Most wished for in Kitchen' })).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: 'Departments' })).getByRole('link', { name: 'Audio' })).toHaveAttribute('href', '/most-wished-for?c=audio');
});

it('movers & shakers say how far each product climbed, and from where', () => {
  const product = (id: string, title: string) => ({ id, title, image: '', priceMinor: 1000, rating: 4.5, reviewCount: 10, category: 'kitchen', categoryName: 'Kitchen' }) as Parameters<typeof RankedPage>[0]['items'][number];
  render(
    <RankedPage
      store={amazon}
      basePath="/movers-and-shakers"
      kicker="Movers & shakers"
      title="Movers & shakers"
      lede="The biggest gainers in sales rank."
      categories={categories}
      items={[product('a', 'Kettle'), product('b', 'Mug')]}
      saved={new Set()}
      ranked
      moves={new Map([['a', { rank: 4, wasRank: 1240 }], ['b', { rank: 2, wasRank: null }]])}
    />,
  );
  const [kettle, mug] = screen.getAllByRole('listitem');
  expect(kettle).toHaveTextContent('Rank #1');
  expect(kettle).toHaveTextContent('▲ Up 30,900% · Sales rank 4 (was 1,240)');
  expect(mug).toHaveTextContent('Rank #2');
  expect(mug).toHaveTextContent('▲ New · Sales rank 2 (previously unranked)');
  expect(within(screen.getByRole('navigation', { name: 'Charts' })).getByRole('link', { name: 'Movers & shakers' })).toHaveAttribute('aria-current', 'page');
});

it('across all departments, shows each department’s top few with a link to its full chart', () => {
  const product = (id: string, title: string, category: string) => ({ id, title, image: '', priceMinor: 1000, rating: 4.5, reviewCount: 10, category, categoryName: category }) as Parameters<typeof RankedPage>[0]['items'][number];
  render(
    <RankedPage
      store={amazon}
      basePath="/bestsellers"
      kicker="Bestsellers"
      title="Bestsellers"
      lede="The products shoppers have rated most."
      categories={categories}
      items={[]}
      saved={new Set()}
      ranked
      rows={[
        { dept: categories[0], items: [product('a', 'Kettle', 'kitchen'), product('b', 'Mug', 'kitchen')] },
        { dept: categories[1], items: [product('c', 'Speaker', 'audio')] },
      ]}
    />,
  );
  const kitchen = screen.getByRole('region', { name: 'Bestsellers in Kitchen' });
  const [kettle, mug] = within(kitchen).getAllByRole('listitem');
  expect(kettle).toHaveTextContent('#1');
  expect(kettle).toHaveTextContent('Kettle');
  expect(mug).toHaveTextContent('#2');
  expect(within(kitchen).getByRole('link', { name: 'See more' })).toHaveAttribute('href', '/bestsellers?c=kitchen');
  const audio = screen.getByRole('region', { name: 'Bestsellers in Audio' });
  expect(within(audio).getByRole('listitem')).toHaveTextContent('#1');
  expect(screen.queryByText(/All departments ·/)).not.toBeInTheDocument();
});

it('a department’s chart lists its top products, not the department rows', () => {
  const product = (id: string, title: string) => ({ id, title, image: '', priceMinor: 1000, rating: 4.5, reviewCount: 10, category: 'kitchen', categoryName: 'Kitchen' }) as Parameters<typeof RankedPage>[0]['items'][number];
  render(
    <RankedPage
      store={amazon}
      basePath="/new-releases"
      kicker="New & trending"
      title="New & trending"
      lede="The newest arrivals."
      categories={categories}
      active="kitchen"
      items={[product('a', 'Kettle')]}
      saved={new Set()}
      ranked={false}
      tag="NEW"
      rows={[]}
    />,
  );
  expect(screen.getByText(/Kitchen ·/)).toHaveTextContent('Kitchen · 1 product');
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveTextContent('Kettle');
});
