import { createVanillaExtractPlugin } from '@vanilla-extract/next-plugin';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // A 10 MB Attachment plus form overhead; the Tickets module enforces 10 MB.
      bodySizeLimit: '11mb',
    },
  },
};

const withVanillaExtract = createVanillaExtractPlugin({
  unstable_turbopack: { mode: 'auto' },
});

export default withVanillaExtract(nextConfig);
