/**
 * Fixture que envuelve el browser de Playwright con playwright-extra + stealth.
 *
 * El plugin stealth oculta las señales de automatización (navigator.webdriver,
 * plugins vacíos, user-agent HeadlessChrome, etc.) que sistemas anti-bot como
 * Akamai usan para bloquear el acceso. Es necesario tanto en headless (CI) como
 * en headed (local) cuando el sitio objetivo utiliza detección activa de bots.
 */
import { chromium as playwrightChromium, test as base, type BrowserContext } from '@playwright/test';
import { chromium as chromiumExtra } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromiumExtra.use(StealthPlugin());

// User-agent de Chrome estable en Windows — igual al que usaría un usuario real.
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ launchOptions }, use) => {
    const browser = await chromiumExtra.launch({
      ...launchOptions,
      // playwright-extra requiere executablePath explícito cuando se usa junto
      // con los browsers administrados por Playwright (no los de Puppeteer).
      executablePath: playwrightChromium.executablePath(),
      args: [
        ...(launchOptions?.args ?? []),
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });

    const context = await browser.newContext({
      userAgent: REAL_UA,
      locale: 'es-MX',
      timezoneId: 'America/Mexico_City',
      extraHTTPHeaders: {
        'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      viewport: { width: 1440, height: 900 },
    });

    await use(context);

    await context.close();
    await browser.close();
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
