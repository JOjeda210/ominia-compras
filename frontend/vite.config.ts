import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// PWA setup: auto-updating service worker + installable manifest, required so the buyer
// can keep capturing orders fully offline per the constitution's offline-first principle.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Compras Omnia',
        short_name: 'Compras',
        description: 'Captura de órdenes de compra sin conexión, sincronizadas con ERPNext.',
        lang: 'es',
        theme_color: '#1a1a2e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell; catalogs/orders themselves live in Dexie, not the SW cache.
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
