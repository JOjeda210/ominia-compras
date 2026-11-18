import { defineConfig, devices } from '@playwright/test';

// Runs against the production build + preview server, not `vite dev`: the offline-reload
// scenario depends on the PWA service worker precaching the compiled app shell (workbox
// generateSW), which only happens on a real build -- the dev server serves ES modules
// on-demand and a reload while offline simply fails to fetch them.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    cwd: '../frontend',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
