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
        name: 'Countwise - Offline Stock Counting',
        short_name: 'Countwise',
        description: 'Offline-first inventory counting with automatic synchronization',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Exclude sync & auth API routes from service worker caching
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/sync/],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:4000',
      '/sync': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
});
