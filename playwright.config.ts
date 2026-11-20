import { defineConfig } from '@playwright/test'
const port = Number(process.env.STUDY_TEST_PORT || 4197)
const baseURL = `http://127.0.0.1:${port}/plot-study/`

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    viewport: { width: 1366, height: 768 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_BIN || undefined,
      args: ['--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort --base /plot-study/`,
    url: baseURL,
    reuseExistingServer: false,
  },
})
