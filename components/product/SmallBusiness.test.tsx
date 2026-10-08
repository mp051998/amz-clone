import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SmallBusinessBadge, SmallBusinessPanel } from './SmallBusiness';

afterEach(cleanup);

it('links the badge to the brand’s story when given where', () => {
  render(<SmallBusinessBadge href="#small-business" />);
  expect(screen.getByRole('link', { name: 'Small Business' })).toHaveAttribute('href', '#small-business');
});

it('names the brand, says what it makes, and links to its store', () => {
  render(<SmallBusinessPanel business={{ brand: 'Smartivity', story: 'STEM building kits.' }} storeHref="/in/stores/Smartivity" />);
  const section = screen.getByRole('region', { name: 'From a small business' });
  expect(section).toHaveAttribute('id', 'small-business');
  expect(section).toHaveTextContent('This product is from Smartivity, a small business brand. STEM building kits.');
  expect(screen.getByRole('link', { name: 'Visit the Smartivity Store' })).toHaveAttribute('href', '/in/stores/Smartivity');
});
