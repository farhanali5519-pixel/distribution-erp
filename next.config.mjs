import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isOnPremBuild = process.env.SALEFLOW_ONPREM_BUILD === 'true';
const isHostingerBundle = process.env.SALEFLOW_HOSTINGER_BUNDLE === 'true';
const isStandalone = isOnPremBuild || isHostingerBundle;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output is enabled for on-premise packaging and Hostinger standalone bundle
  ...(isStandalone ? { output: 'standalone' } : {}),
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['node:sqlite'],
  outputFileTracingExcludes: {
    '*': [
      'src/**/*',
      'scripts/**/*',
      'docs/**/*',
      'backups/**/*',
      'dist/**/*',
      'data/**/*',
      'scratch/**/*',
      '*.md',
      '*.bat',
      '*.ts',
      '*.tsx',
    ],
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;

