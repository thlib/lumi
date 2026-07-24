// @ts-check

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
      },
    },
    {
      name: 'opera',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath: process.env.OPERA_EXECUTABLE_PATH ?? '/usr/bin/opera',
        },
      },
    },
    {
      name: 'edge',
      use: {
        browserName: 'chromium',
        channel: 'msedge',
      },
    },
  ],
  webServer: {
    command: 'node test/browser/server.js',
    url: 'http://127.0.0.1:4173/test/browser/fixture.html',
    reuseExistingServer: !process.env.CI,
  },
})
