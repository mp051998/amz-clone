import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AllMenu, type AllMenuProps } from './AllMenu';

afterEach(cleanup);

const props: AllMenuProps = {
  greeting: 'Hello, Asha',
  greetingHref: '/in/account',
  sections: [
    { heading: 'Trending', links: [{ label: "Today's Deals", href: '/in/deals' }] },
    { heading: 'Shop by department', links: [{ label: 'Electronics', href: '/in/s?dept=electronics' }, { label: 'Books', href: '/in/s?dept=books' }] },
    { heading: 'Empty', links: [] },
    { heading: 'Help & settings', links: [{ label: 'Customer service', href: '/in/customer-service' }] },
  ],
};

const trigger = () => screen.getByRole('button', { name: 'All' });
const dialog = () => screen.queryByRole('dialog', { name: 'Shop by department, programs and help' });

it('opens a side menu with the greeting and every section, focus on close', () => {
  render(<AllMenu {...props} />);
  expect(dialog()).toBeNull();
  expect(trigger()).toHaveAttribute('aria-expanded', 'false');

  act(() => trigger().click());
  const d = dialog()!;
  expect(d).toHaveAttribute('aria-modal', 'true');
  expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  expect(within(d).getByRole('link', { name: 'Hello, Asha' })).toHaveAttribute('href', '/in/account');
  const depts = within(d).getByRole('navigation', { name: 'Shop by department' });
  expect(within(depts).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/in/s?dept=electronics', '/in/s?dept=books']);
  expect(within(d).queryByRole('navigation', { name: 'Empty' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
});

it('Escape closes it and gives focus back to "All"', () => {
  render(<AllMenu {...props} />);
  act(() => trigger().click());
  fireEvent.keyDown(dialog()!, { key: 'Escape' });
  expect(dialog()).toBeNull();
  expect(trigger()).toHaveFocus();
  expect(document.body.style.overflow).toBe('');
});

it('the backdrop and the close button close it too', () => {
  render(<AllMenu {...props} />);
  act(() => trigger().click());
  act(() => screen.getByTestId('all-menu-backdrop').click());
  expect(dialog()).toBeNull();
  act(() => trigger().click());
  act(() => screen.getByRole('button', { name: 'Close menu' }).click());
  expect(dialog()).toBeNull();
});

it('keeps Tab inside the menu', () => {
  render(<AllMenu {...props} />);
  act(() => trigger().click());
  const d = dialog()!;
  const last = within(d).getByRole('link', { name: 'Customer service' });
  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(within(d).getByRole('link', { name: 'Hello, Asha' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
});
