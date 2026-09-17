import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { CampaignHero } from './CampaignHero';

it('renders a labelled campaign image and destination link', () => {
  render(
    <CampaignHero
      campaign={{
        id: 'us-deals',
        title: 'Deals for every day',
        href: '/deals',
        image: '/campaigns/us-deals.svg',
        alt: 'Colorful boxes for a daily deals campaign',
      }}
    />,
  );

  expect(screen.getByRole('link', { name: /deals for every day/i })).toHaveAttribute('href', '/deals');
  expect(screen.getByRole('img', { name: /colorful boxes/i })).toBeInTheDocument();
});
