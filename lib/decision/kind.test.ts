import { describe, expect, it } from 'vitest';
import { kindMatch, productKind, sameKind } from './kind';

describe('productKind', () => {
  it('tells apart products that share a broad category', () => {
    expect(productKind('boAt Rockerz 411 Bluetooth Headphones, 40H Battery')?.kind).toBe('headphones');
    expect(productKind('OnePlus Nord Buds 3r TWS Earbuds, up to 54H Playback')?.kind).toBe('earbuds');
    expect(productKind('Fire-Boltt Phoenix Pro 1.39" Bluetooth Calling Smartwatch')?.kind).toBe('smartwatch');
    expect(productKind('Wireless Earbuds, Sports Bluetooth Headphones')?.kind).toBe('earbuds');
    expect(productKind('Hawkins Classic 2 Litre Pressure Cooker')?.kind).toBe('pressure-cooker');
    expect(productKind('Bosch TrueMixx Pro Mixer Grinder, 750W')?.kind).toBe('mixer-grinder');
    expect(productKind('Samsung Galaxy A56 5G (Awesome Olive, 8GB RAM)')?.kind).toBe('phone');
    expect(productKind('The Silent Patient')).toBeNull();
  });

  it('scores kind, group and unknown matches', () => {
    const hp = productKind('Sony WH-CH520 Wireless On-Ear Bluetooth Headphones');
    expect(kindMatch(hp, productKind('Soundcore Q20i Headphones'))).toBe(2);
    expect(kindMatch(hp, productKind('TOZO A1 Wireless Earbuds'))).toBe(1);
    expect(kindMatch(hp, productKind('Noise Twist Smartwatch'))).toBe(0);
    expect(kindMatch(hp, null)).toBeNull();
  });
});

describe('sameKind', () => {
  const pool = [
    { title: 'Noise Twist Round Smartwatch, BT Calling' },
    { title: 'Boult Q Over-Ear Bluetooth Headphones' },
    { title: 'boAt Airdopes 219 TWS Earbuds' },
  ];

  it('prefers the same kind, then the same group, never a different one', () => {
    expect(sameKind('boAt Rockerz 371 Bluetooth Headphones', pool)).toEqual([pool[1]]);
    expect(sameKind('boAt Rockerz 371 Bluetooth Headphones', [pool[0], pool[2]])).toEqual([pool[2]]);
    expect(sameKind('boAt Rockerz 371 Bluetooth Headphones', [pool[0]])).toEqual([]);
  });

  it('keeps the pool when the product is unclassified', () => {
    expect(sameKind('Mystery gadget', pool)).toEqual(pool);
  });
});
