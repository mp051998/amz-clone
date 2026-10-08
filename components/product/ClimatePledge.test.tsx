import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ClimateBadge, ClimateFeatures } from './ClimatePledge';

afterEach(cleanup);

it('links the badge to the certifications when given where', () => {
  render(<ClimateBadge href="#climate" />);
  expect(screen.getByRole('link', { name: 'Climate Pledge Friendly' })).toHaveAttribute('href', '#climate');
});

it('lists each certification with what it means', () => {
  render(<ClimateFeatures certs={['carbon', 'recycled']} />);
  const section = screen.getByRole('region', { name: 'Sustainability features' });
  expect(section).toHaveAttribute('id', 'climate');
  const items = within(section).getAllByRole('listitem');
  expect(items.map((li) => li.querySelector('span')?.textContent)).toEqual(['Carbon reduced', 'Recycled materials']);
  expect(section).toHaveTextContent('certified for 2 sustainability practices');
});
