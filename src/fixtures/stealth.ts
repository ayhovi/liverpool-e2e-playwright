/**
 * Fixture que aplica playwright-extra + stealth para Chromium y usa el browser
 * nativo de Playwright para Firefox y WebKit.
 *
 * El plugin stealth oculta las señales de automatización (navigator.webdriver,
 * plugins vacíos, user-agent HeadlessChrome, etc.) que Akamai usa para bloquear
 * el acceso. Firefox y WebKit no necesitan stealth porque no exponen esas señales
 * del mismo modo, y Akamai los bloquea con menos agresividad.
 *
 * El contexto siempre se crea con user-agent real, locale y headers correctos
 * independientemente del browser, para normalizar el fingerprint HTTP.
 */
import {
  chromium as playwrightChromium,
  firefox as playwrightFirefox,
  webkit as playwrightWebkit,
  test as base,
  type BrowserContext,
  type Browser,
  type BrowserType,
} from '@playwright/test';
import { chromium as chromiumExtra } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromiumExtra.use(StealthPlugin());

// User-agent de Chrome estable en Windows.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Opciones de contexto compartidas por todos los browsers.
const SHARED_CONTEXT_OPTIONS = {
  locale: 'es-MX',
  timezoneId: 'America/Mexico_City',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: {
    'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
  },
} as const;

export const test = base.extend<
  { context: BrowserContext },
  { managedBrowser: Browser }
>({
  /**
   * Scope 'worker': un browser por worker, reutilizado en todos los tests del worker.
   * Para Chromium usa playwright-extra+stealth; para Firefox/WebKit el browser nativo.
   * Esto evita el cierre prematuro de la página cuando los tests corren en paralelo.
   */
  managedBrowser: [
    async ({ launchOptions }, use, workerInfo) => {
      // workerInfo.project.use contiene la configuración del proyecto activo
      // (chromium / firefox / webkit). Lo usamos para elegir el launcher correcto.
      const browserName = workerInfo.project.use.browserName ?? 'chromium';

      let browser: Browser;

      if (browserName === 'chromium') {
        browser = await chromiumExtra.launch({
          ...launchOptions,
          executablePath: playwrightChromium.executablePath(),
          args: [
            ...(launchOptions?.args ?? []),
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
          ],
        });
      } else {
        // Firefox y WebKit: launcher nativo de Playwright, sin stealth.
        const launcher: BrowserType =
          browserName === 'firefox' ? playwrightFirefox : playwrightWebkit;
        browser = await launcher.launch({ ...launchOptions });
      }

      await use(browser);
      await browser.close();
    },
    { scope: 'worker' },
  ],

  // Un context fresco por test con las opciones comunes + UA de Chrome para Chromium.
  context: async ({ managedBrowser }, use, testInfo) => {
    const browserName = testInfo.project.use.browserName ?? 'chromium';

    const context = await managedBrowser.newContext({
      ...SHARED_CONTEXT_OPTIONS,
      // Solo forzamos el UA de Chrome en Chromium; Firefox/WebKit usan el suyo.
      ...(browserName === 'chromium' && {
        userAgent: CHROME_UA,
        extraHTTPHeaders: {
          ...SHARED_CONTEXT_OPTIONS.extraHTTPHeaders,
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
      }),
    });

    await use(context);
    await context.close();
  },

  // Una page por test, ciclo de vida atado al context.
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export { expect } from '@playwright/test';
