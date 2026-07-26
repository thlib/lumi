// @ts-check

import { defineConfig } from '@playwright/test'

const browserPort = process.env.LUMI_BROWSER_PORT ?? '4173'
const browserBaseUrl = `http://127.0.0.1:${browserPort}`

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: browserBaseUrl,
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
      name: 'edge',
      use: {
        browserName: 'chromium',
        channel: 'msedge',
      },
    },
  ],
  webServer: {
    command: 'node test/browser/server.js',
    url: `${browserBaseUrl}/test/browser/fixture.html`,
    reuseExistingServer: !process.env.CI,
  },
})
