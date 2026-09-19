import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 75_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.BASE_URL ?? 'https://www.liverpool.com.mx',
    headless: false,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // El reto exige screenshots ante fallo. Video queda apagado para mantener
    // la ejecución y los artefactos de CI ligeros.
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    // User-agent de Chrome real para evitar bloqueos de Akamai Bot Manager.
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
    },
    // Ocultar señales de automatización del WebDriver.
    launchOptions: {
      args: ['--disable-blink-features=AutomationControlled'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
