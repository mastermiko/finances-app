/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
  license: string;
};

/**
 * Strict Content-Security-Policy, injected as a <meta> tag in production builds only
 * (the dev server needs inline scripts for HMR). Static hosts also receive the same
 * policy as an HTTP header through public/_headers (frame-ancestors needs a header).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types finances-app default',
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'finances-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        ),
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_LICENSE__: JSON.stringify(pkg.license),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Few, cacheable chunks for the first screen (HTTP/1.1 hosts limit parallel
        // requests); everything else keeps automatic per-screen splitting (ADR 0006).
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:react|react-dom|scheduler|@tanstack[\\/](?:react-router|router-core|history|react-store|store)|use-sync-external-store|seroval|seroval-plugins|cookie-es|dexie|dexie-react-hooks|@formatjs[\\/][^\\/]+|intl-messageformat|react-intl|zustand|tslib)[\\/]/,
              priority: 2,
            },
            {
              name: 'core',
              test: /[\\/]src[\\/](?:domain[\\/](?:common|money)[\\/]|domain[\\/]model[\\/](?:constants|defaults|migrations)\.ts|data[\\/](?:clock|db|queries|schemas-loader)\.ts|data[\\/]repositories[\\/]settings\.ts|ui[\\/]components[\\/]toast-store\.ts|i18n[\\/](?:index\.tsx|fr\.ts|format\.ts))/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    cspMeta(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: './',
        name: 'Finances',
        short_name: 'Finances',
        description: 'Gestion de finances personnelles, locale et hors ligne.',
        lang: 'fr',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f5f1',
        theme_color: '#1d4f8f',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [{ name: 'Nouvelle opération', short_name: 'Ajouter', url: './#/?new=1' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        globIgnores: ['**/sbom*.json', '**/stats*.json'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    restoreMocks: true,
    testTimeout: 20000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup-dom.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/io/**', 'src/data/**', 'src/features/**', 'src/ui/**'],
      exclude: ['**/*.test.*', '**/*.stories.*', '**/index.ts', 'src/io/workers/**', '**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary', 'lcov'],
      thresholds: {
        'src/domain/**': { lines: 90 },
        'src/io/**': { lines: 90 },
        'src/features/**': { lines: 70 },
        'src/ui/**': { lines: 70 },
      },
    },
  },
});
