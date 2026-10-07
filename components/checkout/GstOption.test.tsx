import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GstOption } from './GstOption';

afterEach(cleanup);

it('asks for the GSTIN and business name only once ticked', () => {
  const { container } = render(<form><GstOption nameMax={100} /></form>);
  expect(screen.queryByLabelText('GSTIN')).toBeNull();
  expect(new FormData(container.querySelector('form')!).get('gst')).toBeNull();

  fireEvent.click(screen.getByLabelText('Use GST invoice for a business purchase'));
  const gstin = screen.getByLabelText('GSTIN');
  const name = screen.getByLabelText('Business name');
  expect(gstin).toHaveAttribute('maxlength', '15');
  expect(gstin).toBeRequired();
  expect(name).toHaveAttribute('maxlength', '100');
  expect(name).toBeRequired();
  fireEvent.change(gstin, { target: { value: '27AAPFU0939F1ZV' } });
  fireEvent.change(name, { target: { value: 'Acme Traders' } });

  const form = new FormData(container.querySelector('form')!);
  expect([form.get('gst'), form.get('gstin'), form.get('gstName')]).toEqual(['on', '27AAPFU0939F1ZV', 'Acme Traders']);
});
