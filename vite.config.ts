import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    // Top-level await requires ES2022+. All evergreen browsers have supported
    // it since mid-2021 (Chrome 89, Firefox 89, Safari 15).
    target: 'esnext',
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Orbit Snap',
        short_name: 'Orbit Snap',
        description: 'Tap when the ring meets the orb.',
        id: '/',
        start_url: '/',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: '/assets/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,mp3}'],
        globIgnores: ['**/node_modules/**/*'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        runtimeCaching: [
          {
            urlPattern: /\.mp3$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-cache',
              expiration: { maxEntries: 10 },
            },
          },
        ],
      },
    }),
  ],
});
