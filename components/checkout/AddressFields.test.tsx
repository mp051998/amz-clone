import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { addressChecks } from '@/lib/address-patterns';
import { AddressFields } from './AddressFields';

afterEach(cleanup);

it('each US field carries the browser check for its rule', () => {
  render(<AddressFields isIN={false} />);
  const us = addressChecks(false);
  expect(screen.getByLabelText('Phone number')).toHaveAttribute('pattern', us.phone!.pattern);
  expect(screen.getByLabelText('Phone number')).toHaveAttribute('title', 'Enter a 10-digit phone number');
  expect(screen.getByLabelText('State')).toHaveAttribute('pattern', us.state!.pattern);
  expect(screen.getByLabelText('ZIP Code')).toHaveAttribute('title', 'Enter a valid ZIP Code');
  expect(screen.getByLabelText('Apt, suite, etc. (optional)')).not.toHaveAttribute('pattern');
});

it('the India form checks the mobile number and Pincode its own way', () => {
  render(<AddressFields isIN />);
  const ind = addressChecks(true);
  expect(screen.getByLabelText('Mobile number')).toHaveAttribute('pattern', ind.phone!.pattern);
  expect(screen.getByLabelText('Pincode')).toHaveAttribute('pattern', ind.postcode!.pattern);
  expect(screen.getByLabelText('Area, Street, Sector, Village')).toHaveAttribute('title', 'Enter an area/street');
  expect(screen.getByLabelText('Landmark (optional)')).not.toHaveAttribute('pattern');
});
