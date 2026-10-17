import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';

/** Commit của bản build: lấy lúc build (nền tảng như hPanel build từ git nhưng không giữ .git khi chạy). */
function buildCommit(): string {
  if (process.env.GIT_COMMIT_SHA) return process.env.GIT_COMMIT_SHA;
  try { const sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); return /^[0-9a-f]{40}$/.test(sha) ? sha : ''; } catch { return ''; }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { BUILD_COMMIT_SHA: buildCommit() },
  experimental: { cpus: 1, webpackBuildWorker: false },
  output:'standalone',
  async headers() {
    const security = [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'Referrer-Policy', value: 'same-origin' }];
    return [{ source: '/:path*', headers: security }, ...['/', '/verify', '/sop', '/trust', '/privacy'].map(source => ({ source, headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] }))];
  },
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes:{'/*':['./data/runtime/**','./data/uploads/**','./.env*','./.codex-finalizer/**']},
  distDir:process.env.NEXT_BUILD_DIR || '.next',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
