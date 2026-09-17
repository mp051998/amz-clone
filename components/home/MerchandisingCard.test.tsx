import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MerchandisingCard } from './MerchandisingCard';

it('renders labelled local media and destinations for merchandising items', () => {
  render(
    <MerchandisingCard
      card={{
        id: 'audio-picks',
        title: 'Audio picks for you',
        cta: 'Shop all audio',
        href: '/s?dept=electronics',
        items: [
          {
            image: '/products/headphones.jpg',
            alt: 'Wireless headphones in black',
            href: '/product/headphones',
            label: 'Wireless headphones',
          },
        ],
      }}
    />,
  );

  expect(screen.getByRole('img', { name: /wireless headphones in black/i })).toHaveAttribute('src', '/products/headphones.jpg');
  expect(screen.getByRole('link', { name: /wireless headphones/i })).toHaveAttribute('href', '/product/headphones');
  expect(screen.getByRole('link', { name: /shop all audio/i })).toHaveAttribute('href', '/s?dept=electronics');
});
