import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'MegaHertz Depot — Offline PC Hardware POS',
        short_name: 'MegaHertz POS',
        description: 'Offline-first computer hardware POS, custom rig builder, and stock sync',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff2}'],
        navigateFallback: '/index.html',
        // Exclude sync & auth API routes from service worker caching
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/sync/, /^\/public/, /^\/upload$/],
        runtimeCaching: [
          {
            urlPattern: /^\/uploads\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'product-images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:4000',
      '/stores': 'http://localhost:4000',
      '/sync': 'http://localhost:4000',
      '/public': 'http://localhost:4000',
      '/upload': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
});
