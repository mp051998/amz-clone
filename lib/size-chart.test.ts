import { describe, expect, it } from 'vitest';
import { fitOf, sizeChartFor } from './size-chart';

describe('fitOf', () => {
  it('reads men’s or women’s sizes from the title', () => {
    expect(fitOf("Under Armour Men's Charged Assert 11 Running Shoes")).toBe('men');
    expect(fitOf('Jockey Mens Cotton Rich T-Shirt')).toBe('men');
    expect(fitOf('Campus Men First Running Shoes')).toBe('men');
    expect(fitOf('SPARX Women Pull-On Sneaker Shoes')).toBe('women');
    expect(fitOf("Ladies' Running Tee")).toBe('women');
    expect(fitOf('Classic Crew Neck Tee')).toBeNull();
    expect(fitOf('Menthol Mints')).toBeNull();
  });
});

describe('sizeChartFor', () => {
  it('measures letter sizes around the chest, in inches and cm', () => {
    const chart = sizeChartFor(['S', 'M', 'L'], 'ADRO Mens Regular Fit T-Shirt');
    expect(chart).toMatchObject({ title: 'Men’s tops', columns: ['Size', 'Chest (in)', 'Chest (cm)'] });
    expect(chart!.rows).toEqual([
      { size: 'S', cells: ['36–38', '91–97'] },
      { size: 'M', cells: ['38–40', '97–102'] },
      { size: 'L', cells: ['40–42', '102–107'] },
    ]);
  });

  it('measures women’s letter sizes around the bust', () => {
    const chart = sizeChartFor(['XS', 'M'], 'Women’s Yoga Top');
    expect(chart).toMatchObject({ title: 'Women’s tops', columns: ['Size', 'Bust (in)', 'Bust (cm)'] });
    expect(chart!.rows[1]).toEqual({ size: 'M', cells: ['36–37', '91–94'] });
  });

  it('converts UK shoe sizes, with US sizes when the title says whose', () => {
    const men = sizeChartFor(['UK 6', 'UK 8', 'UK 11'], 'Campus Men First Running Shoes');
    expect(men).toMatchObject({ title: 'Men’s shoes', columns: ['UK', 'US men', 'EU', 'Foot length (cm)'] });
    expect(men!.rows).toEqual([
      { size: 'UK 6', cells: ['7', '39.5', '24.7'] },
      { size: 'UK 8', cells: ['9', '42', '26.4'] },
      { size: 'UK 11', cells: ['12', '46', '29.0'] },
    ]);
    const women = sizeChartFor(['UK 4'], 'SPARX Women Pull-On Sneaker Shoes');
    expect(women).toMatchObject({ title: 'Women’s shoes', columns: ['UK', 'US women', 'EU', 'Foot length (cm)'] });
    expect(women!.rows).toEqual([{ size: 'UK 4', cells: ['6', '36.5', '23.1'] }]);
    expect(sizeChartFor(['UK 7'], 'Canvas Sneakers')).toMatchObject({ title: 'Shoes', columns: ['UK', 'EU', 'Foot length (cm)'] });
  });

  it('converts US shoe sizes, half sizes too, only when the title says whose', () => {
    const chart = sizeChartFor(['7', '9.5', '12'], "HOKA Men's Bondi 9 Road Running Shoe");
    expect(chart).toMatchObject({ title: 'Men’s shoes', columns: ['US', 'UK', 'EU', 'Foot length (cm)'] });
    expect(chart!.rows).toEqual([
      { size: '7', cells: ['6', '39.5', '24.7'] },
      { size: '9.5', cells: ['8.5', '42.5', '26.9'] },
      { size: '12', cells: ['11', '46', '29.0'] },
    ]);
    expect(sizeChartFor(['8'], "Women's Trail Runner")!.rows).toEqual([{ size: '8', cells: ['6', '39.5', '24.7'] }]);
    expect(sizeChartFor(['8', '9'], 'Trail Runner')).toBeNull();
  });

  it('has no chart without sizes, for sizes it doesn’t know, or for mixed systems', () => {
    expect(sizeChartFor(undefined, 'Tee')).toBeNull();
    expect(sizeChartFor([], 'Tee')).toBeNull();
    expect(sizeChartFor(['One Size'], 'Men’s Cap')).toBeNull();
    expect(sizeChartFor(['M', 'UK 8'], "Men's Shoe")).toBeNull();
  });
});
