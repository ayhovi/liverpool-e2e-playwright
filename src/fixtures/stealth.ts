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

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ launchOptions }, use) => {
    const browser = await chromiumExtra.launch({
      ...launchOptions,
      // playwright-extra requiere executablePath explícito cuando se usa junto
      // con los browsers administrados por Playwright (no los de Puppeteer).
      executablePath: playwrightChromium.executablePath(),
    });

    const context = await browser.newContext();
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
