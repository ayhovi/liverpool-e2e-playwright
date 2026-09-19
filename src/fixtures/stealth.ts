/**
 * Fixture de anti-detección que funciona con cualquier browser (Chromium,
 * Firefox, WebKit) sin interferir con el ciclo de vida del browser nativo
 * que Playwright gestiona internamente por worker.
 *
 * Estrategia:
 * - Usa siempre el `browser` fixture nativo de Playwright (scope worker).
 * - Inyecta un script de stealth via addInitScript en el context de Chromium,
 *   que es el único engine que expone navigator.webdriver = true en headless.
 * - Firefox y WebKit reciben las opciones de locale/headers pero sin el script,
 *   ya que no necesitan stealth para pasar los checks de Akamai.
 */
import { test as base, type BrowserContext } from '@playwright/test';

// Snippet mínimo de stealth: oculta las propiedades que Akamai detecta.
// Es equivalente a lo que hace puppeteer-extra-plugin-stealth pero inyectado
// directamente en el context de Playwright, sin depender de un browser extra.
const STEALTH_SCRIPT = `
  // Elimina navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // Simula plugins de Chrome real
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      arr.item = (i) => arr[i];
      arr.namedItem = (name) => arr.find(p => p.name === name) || null;
      arr.refresh = () => {};
      return arr;
    },
  });

  // Simula languages reales
  Object.defineProperty(navigator, 'languages', { get: () => ['es-MX', 'es', 'en-US', 'en'] });

  // Oculta que Chrome está en modo automatizado
  if (window.chrome) {
    window.chrome.runtime = window.chrome.runtime || {};
  } else {
    Object.defineProperty(window, 'chrome', {
      get: () => ({ runtime: {} }),
    });
  }

  // Oculta el error de permisos que delata headless
  const originalQuery = window.navigator.permissions?.query?.bind(navigator.permissions);
  if (originalQuery) {
    navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, name: 'notifications' } as PermissionStatus)
        : originalQuery(parameters);
  }
`;

const BASE_CONTEXT_OPTIONS = {
  locale: 'es-MX',
  timezoneId: 'America/Mexico_City',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: {
    'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
  },
} as const;

const CHROMIUM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const test = base.extend<{ context: BrowserContext }>({
  /**
   * Reemplaza el context de Playwright sin tocar el browser.
   * El browser nativo (scope worker) lo gestiona Playwright internamente.
   */
  context: async ({ browser }, use, testInfo) => {
    const browserName = testInfo.project.use.browserName ?? 'chromium';
    const isChromium = browserName === 'chromium';

    const context = await browser.newContext({
      ...BASE_CONTEXT_OPTIONS,
      ...(isChromium && {
        userAgent: CHROMIUM_UA,
        extraHTTPHeaders: {
          ...BASE_CONTEXT_OPTIONS.extraHTTPHeaders,
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
      }),
    });

    // Inyecta el script de stealth solo en Chromium, antes de cada navegación.
    if (isChromium) {
      await context.addInitScript(STEALTH_SCRIPT);
    }

    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export { expect } from '@playwright/test';
