/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = {
  ...(isProd ? { output: 'export' } : {}),
  // Only use basePath and assetPrefix for GitHub Pages deployment
  ...(isGitHubPages ? {
    basePath: '/youcupid',
    assetPrefix: '/youcupid',
  } : {}),
  images: {
    unoptimized: true,
    ...(isGitHubPages ? {
      path: '/youcupid/_next/image',
    } : {}),
  },
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      url: require.resolve('url'),
      zlib: require.resolve('browserify-zlib'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      assert: require.resolve('assert'),
      os: require.resolve('os-browserify'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
    };
    return config;
  },
};

module.exports = nextConfig;
