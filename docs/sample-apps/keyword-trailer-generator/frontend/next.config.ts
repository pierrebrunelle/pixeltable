import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'data', hostname: '**' }],
  },
}

export default nextConfig
