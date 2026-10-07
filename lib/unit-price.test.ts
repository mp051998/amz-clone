import { describe, expect, it } from 'vitest';
import { toProduct } from './data/map';
import { isUnitKind, parseUnitSize, unitPriceMinor, unitPriceText, unitSizeText } from './unit-price';

describe('parseUnitSize', () => {
  it('reads a quantity and a unit, however it is written', () => {
    expect(parseUnitSize('3 fl oz')).toEqual({ qty: 3, kind: 'fl_oz' });
    expect(parseUnitSize('3 Fl. Oz.')).toEqual({ qty: 3, kind: 'fl_oz' });
    expect(parseUnitSize('1.86 oz')).toEqual({ qty: 1.86, kind: 'oz' });
    expect(parseUnitSize('150ml')).toEqual({ qty: 150, kind: 'ml' });
    expect(parseUnitSize(' 50  g ')).toEqual({ qty: 50, kind: 'g' });
    expect(parseUnitSize('30 Pack')).toEqual({ qty: 30, kind: 'count' });
    expect(parseUnitSize('160 pcs')).toEqual({ qty: 160, kind: 'count' });
    expect(parseUnitSize('2 lbs')).toEqual({ qty: 2, kind: 'lb' });
    expect(parseUnitSize('1 kg')).toEqual({ qty: 1, kind: 'kg' });
    expect(parseUnitSize('1.5 Litres')).toEqual({ qty: 1.5, kind: 'l' });
    expect(parseUnitSize('0.333 oz')).toEqual({ qty: 0.33, kind: 'oz' });
  });

  it('refuses what is not a quantity and a known unit', () => {
    for (const bad of ['', 'oz', '3', 'three oz', '3 bottles', '-3 oz', '0 ml', '200000 g', '2 + 3 oz']) {
      expect(parseUnitSize(bad)).toBeNull();
    }
  });
});

describe('unit prices', () => {
  it('divide the price by what the product holds, per the unit’s base', () => {
    expect(unitPriceMinor(1999, { qty: 3, kind: 'fl_oz' })).toBe(666);
    expect(unitPriceMinor(27500, { qty: 100, kind: 'ml' })).toBe(27500);
    expect(unitPriceMinor(17800, { qty: 150, kind: 'ml' })).toBe(11867);
    expect(unitPriceMinor(24500, { qty: 50, kind: 'g' })).toBe(49000);
    expect(unitPriceMinor(5495, { qty: 30, kind: 'count' })).toBe(183);
  });

  it('are written to the cent in the store’s currency', () => {
    expect(unitPriceText(5899, 'USD', { qty: 3, kind: 'fl_oz' })).toBe('$19.66 / Fl Oz');
    expect(unitPriceText(5599, 'USD', { qty: 1.86, kind: 'oz' })).toBe('$30.10 / Ounce');
    expect(unitPriceText(5495, 'USD', { qty: 30, kind: 'count' })).toBe('$1.83 / Count');
    expect(unitPriceText(17800, 'INR', { qty: 150, kind: 'ml' })).toBe('₹118.67 / 100 ml');
    expect(unitPriceText(36800, 'INR', { qty: 80, kind: 'g' })).toBe('₹460.00 / 100 g');
    expect(unitPriceText(12345600, 'INR', { qty: 1, kind: 'kg' })).toBe('₹1,23,456.00 / kg');
  });

  it('size text round-trips through the parser', () => {
    for (const text of ['3 fl oz', '1.86 oz', '150 ml', '30 count', '2 lb', '50 g', '1 kg', '1.5 l']) {
      expect(unitSizeText(parseUnitSize(text)!)).toBe(text);
    }
    expect(isUnitKind('fl_oz')).toBe(true);
    expect(isUnitKind('cup')).toBe(false);
  });
});

it('reads a product’s unit off the catalog, skipping a half-set or unknown one', () => {
  expect(toProduct({ id: 'a', unit_qty: 1.86, unit_kind: 'oz' }).unit).toEqual({ qty: 1.86, kind: 'oz' });
  expect(toProduct({ id: 'a', unit_qty: '150.00' as unknown as number, unit_kind: 'ml' }).unit).toEqual({ qty: 150, kind: 'ml' });
  expect(toProduct({ id: 'a', unit_qty: null, unit_kind: null }).unit).toBeUndefined();
  expect(toProduct({ id: 'a', unit_qty: 3, unit_kind: 'cup' }).unit).toBeUndefined();
  expect(toProduct({ id: 'a' }).unit).toBeUndefined();
});
