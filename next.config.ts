import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // admin product images (up to 3 MB) are uploaded through a Server Action; Vercel caps bodies at 4.5 MB
    serverActions: { bodySizeLimit: '4mb' },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
