import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { SearchHelp } from './SearchHelp';

afterEach(cleanup);

it('points to the help section and contact page, in the store', () => {
  render(<SearchHelp store={amazonIn} results />);
  const help = screen.getByRole('region', { name: 'Need help?' });
  expect(help).toHaveTextContent('Visit the help section or contact us');
  expect(screen.getByRole('link', { name: 'help section' })).toHaveAttribute('href', '/in/customer-service');
  expect(screen.getByRole('link', { name: 'contact us' })).toHaveAttribute('href', '/in/customer-service/contact');
  expect(screen.getByText(/Price and other details may vary based on product size and colour\./)).toBeInTheDocument();
});

it('notes that options change the price only when there are results', () => {
  render(<SearchHelp store={amazon} results />);
  expect(screen.getByText(/size and color\./)).toBeInTheDocument();
  cleanup();
  render(<SearchHelp store={amazon} results={false} />);
  expect(screen.queryByText(/Price and other details may vary/)).toBeNull();
  expect(screen.getByRole('link', { name: 'help section' })).toHaveAttribute('href', '/customer-service');
});
