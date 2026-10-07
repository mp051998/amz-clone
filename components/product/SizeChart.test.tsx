import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SizeChart } from './SizeChart';

afterEach(cleanup);

it('lists the product’s sizes with their measurements, the one picked highlighted', () => {
  render(<SizeChart sizes={['S', 'M', 'L']} title="Jockey Mens Cotton T-Shirt" selected="M" />);
  expect(screen.getByText('Size Chart').tagName).toBe('SUMMARY');
  const table = screen.getByRole('table', { name: 'Men’s tops' });
  expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Size', 'Chest (in)', 'Chest (cm)']);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.map((r) => r.textContent)).toEqual(['S36–3891–97', 'M38–4097–102', 'L40–42102–107']);
  expect(rows[1]).toHaveAttribute('aria-current', 'true');
  expect(rows[0]).not.toHaveAttribute('aria-current');
});

it('shows nothing for sizes there’s no chart for', () => {
  const { container } = render(<SizeChart sizes={['One Size']} title="Cap" />);
  expect(container).toBeEmptyDOMElement();
});
