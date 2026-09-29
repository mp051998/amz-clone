import type { Category, Product } from '@/lib/types';

export const CATEGORIES: Category[] = [
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'wearables', name: 'Wearables' },
  { slug: 'computers', name: 'Computers' },
  { slug: 'mobiles', name: 'Mobiles' },
  { slug: 'home-kitchen', name: 'Home & Kitchen' },
  { slug: 'kitchen-appliances', name: 'Kitchen Appliances' },
  { slug: 'fashion', name: 'Fashion' },
  { slug: 'beauty', name: 'Beauty' },
  { slug: 'books', name: 'Books' },
  { slug: 'toys', name: 'Toys & Games' },
  { slug: 'sports', name: 'Sports & Outdoors' },
  { slug: 'yoga', name: 'Yoga' },
];

export function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    market: 'US',
    title: 'Acme Wireless Headphones, 40h battery',
    brand: 'Acme',
    category: 'electronics',
    categoryName: 'Electronics',
    image: '/x.jpg',
    priceMinor: 9999,
    rating: 4.4,
    reviewCount: 2500,
    seller: 'Acme',
    shipsFrom: 'Amazon',
    bullets: [],
    stock: 40,
    curBase: 'USD',
    ...over,
  };
}
