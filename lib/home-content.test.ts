import { expect, test } from 'vitest';
import { amazon } from './amazon';
import { amazonIn } from './marketplace-in';
import { getProduct } from './catalog-market';
import { getHomeContent } from './home-content';

test('selects the marketplace campaign and enables Amazon Pay only in India', () => {
  expect(getHomeContent(amazon).campaign.id).toBe('us-deals');
  expect(getHomeContent(amazonIn).campaign.id).toBe('in-festival');
  expect(getHomeContent(amazon).showPay).toBe(false);
  expect(getHomeContent(amazonIn).showPay).toBe(true);
  expect(getHomeContent(amazon).campaign.href).toBe('/deals');
  expect(getHomeContent(amazonIn).campaign.href).toBe('/in/s?dept=electronics');
  expect(getHomeContent(amazonIn).campaign.image).toBe('/campaigns/in-festival.svg');
});

test.each([amazon, amazonIn])('$id cards link to their catalog with meaningful product alt text', (store) => {
  const { cards } = getHomeContent(store);
  const prefix = store.id === 'IN' ? '/in' : '';
  expect(cards).toHaveLength(4);
  for (const card of cards) {
    expect(card.href).toBe(`${prefix}/s?dept=${card.id}`);
    expect(card.items).toHaveLength(4);
    for (const item of card.items) {
      expect(item.href.startsWith(`${prefix}/product/`)).toBe(true);
      const product = getProduct(item.href.split('/').pop()!);
      expect(product).toBeDefined();
      expect(product!.id.startsWith('in-')).toBe(store.id === 'IN');
      expect(item.image).toBe(product!.image);
      expect(item.alt).toBe(product!.title);
    }
  }
});

test('resolves configured rail products without copying records or crossing marketplaces', () => {
  const us = getHomeContent(amazon).rails[0];
  const india = getHomeContent(amazonIn).rails[0];
  expect(us.products.map((product) => product.id)).toEqual(['6181VJVcgSL', '51CnDMbXZzL', '61hzm0JOv3L', '71Hx8b6HGbL']);
  expect(india.products.map((product) => product.id)).toEqual(['in-61BWskzWNIL', 'in-711l4y8aNlL', 'in-71QdB7hDCAL', 'in-51lPcFkwYmL']);
  for (const product of [...us.products, ...india.products]) {
    expect(product).toBe(getProduct(product.id));
  }
});

test('honors configured card and product order instead of fixed marketplace defaults', () => {
  const content = getHomeContent({
    ...amazonIn,
    ui: {
      home: [
        amazonIn.ui.home[0],
        { kind: 'merchandising-grid', id: 'custom-grid', cardIds: ['beauty', 'electronics'] },
        { kind: 'deal-rail', id: 'custom-rail', title: 'Custom picks', productIds: ['in-711l4y8aNlL', '6181VJVcgSL', 'missing', 'in-61BWskzWNIL'] },
      ],
    },
  });
  expect(content.cards.map((card) => card.id)).toEqual(['beauty', 'electronics']);
  expect(content.rails[0].id).toBe('custom-rail');
  expect(content.rails[0].title).toBe('Custom picks');
  expect(content.rails[0].products.map((product) => product.id)).toEqual(['in-711l4y8aNlL', 'in-61BWskzWNIL']);
});

test('uses marketplace deals when a rail has no curated product IDs', () => {
  const { rails } = getHomeContent({
    ...amazonIn,
    ui: { home: [amazonIn.ui.home[0], { kind: 'deal-rail', id: 'all-deals', title: 'Deals', productIds: [] }] },
  });
  expect(rails[0].products.length).toBeGreaterThan(0);
  expect(rails[0].products.every((product) => product.id.startsWith('in-') && product.deal && product.dealPct)).toBe(true);
});
