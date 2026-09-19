/**
 * Fixture que aplica playwright-extra + stealth para Chromium sobreescribiendo
 * únicamente el `context`, sin interferir con el browser nativo de Playwright.
 *
 * Para Firefox y WebKit se reutiliza el browser nativo con opciones de contexto
 * enriquecidas (locale, timezone, headers) pero sin stealth, ya que esos engines
 * no exponen navigator.webdriver de la misma forma.
 *
 * IMPORTANTE: el browser se deja en manos de Playwright (scope worker interno).
 * Este fixture solo reemplaza el context (scope test) para inyectar las opciones
 * anti-detección, lo que evita cualquier conflicto de ciclo de vida en paralelo.
 */
import {
  chromium as playwrightChromium,
  test as base,
  type BrowserContext,
} from '@playwright/test';
import { chromium as chromiumExtra } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromiumExtra.use(StealthPlugin());

// Opciones de contexto compartidas por todos los browsers.
const BASE_CONTEXT_OPTIONS = {
  locale: 'es-MX',
  timezoneId: 'America/Mexico_City',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: {
    'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
  },
} as const;

// Opciones adicionales solo para Chromium (fingerprint HTTP completo).
const CHROMIUM_EXTRA_OPTIONS = {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  extraHTTPHeaders: {
    ...BASE_CONTEXT_OPTIONS.extraHTTPHeaders,
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  },
} as const;

// Browser de stealth reutilizado por worker (solo para Chromium).
// Se inicializa la primera vez que se necesita y se cierra al final del worker.
let stealthBrowserInstance: Awaited<ReturnType<typeof chromiumExtra.launch>> | null = null;
let stealthBrowserRefCount = 0;

async function getStealthBrowser(launchOptions: Record<string, unknown>) {
  if (!stealthBrowserInstance) {
    stealthBrowserInstance = await chromiumExtra.launch({
      ...launchOptions,
      executablePath: playwrightChromium.executablePath(),
      args: [
        ...((launchOptions?.args as string[]) ?? []),
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });
  }
  stealthBrowserRefCount++;
  return stealthBrowserInstance;
}

async function releaseStealthBrowser() {
  stealthBrowserRefCount--;
  if (stealthBrowserRefCount <= 0 && stealthBrowserInstance) {
    await stealthBrowserInstance.close();
    stealthBrowserInstance = null;
    stealthBrowserRefCount = 0;
  }
}

export const test = base.extend<{ context: BrowserContext }>({
  /**
   * Reemplaza el context de Playwright con uno que incluye las opciones de
   * anti-detección. Para Chromium usa playwright-extra+stealth; para otros
   * browsers usa el browser nativo con opciones de contexto enriquecidas.
   */
  context: async ({ browser, launchOptions }, use, testInfo) => {
    const browserName = testInfo.project.use.browserName ?? 'chromium';
    let context: BrowserContext;

    if (browserName === 'chromium') {
      // Chromium: usar playwright-extra+stealth con browser propio por worker.
      const stealthBrowser = await getStealthBrowser(
        launchOptions as Record<string, unknown>,
      );
      context = await stealthBrowser.newContext({
        ...BASE_CONTEXT_OPTIONS,
        ...CHROMIUM_EXTRA_OPTIONS,
      });
    } else {
      // Firefox / WebKit: usar el browser nativo que Playwright ya gestiona.
      context = await browser.newContext({
        ...BASE_CONTEXT_OPTIONS,
      });
    }

    await use(context);
    await context.close();

    if (browserName === 'chromium') {
      await releaseStealthBrowser();
    }
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export { expect } from '@playwright/test';
