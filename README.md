# Liverpool E2E Automation Challenge

[![E2E Tests](https://github.com/ayhovi/liverpool-e2e-playwright/actions/workflows/test.yml/badge.svg)](https://github.com/ayhovi/liverpool-e2e-playwright/actions/workflows/test.yml)

**Pipeline verificado:** [E2E Tests #11 — Success ✅](https://github.com/ayhovi/liverpool-e2e-playwright/actions/runs/35470617723) — este fue el run ejecutado para validar la entrega.

Automatización E2E de Liverpool.com.mx con **Playwright + TypeScript**. Cubre búsqueda, filtro por color, ordenamiento por precio y validación cruzada entre lo que muestra la UI y lo que responde la API.

---

## Setup

Requiere Node.js 20+.

```bash
npm ci
npx playwright install
```

---

## Cómo correrlo

| Comando | Qué hace |
|---|---|
| `npm test` | Prueba principal en Chromium, headless |
| `npm run test:headed` | Lo mismo pero con el browser visible |
| `npm run test:debug` | Modo paso a paso |
| `npm run test:cross-browser` | Chromium + Firefox + WebKit en paralelo |
| `npm run test:optional` | Accesibilidad y performance (bonus) |
| `npm run report` | Abre el reporte HTML |
| `npm run typecheck` | Verifica que el TypeScript compile |

---

## Headless vs headed

- **Headless** (default en CI): `npm test`
- **Headed** (browser visible): `npm run test:headed`

El modo headless se activa automáticamente en CI via la variable de entorno `CI`. Localmente corre headed para evitar el bloqueo del sistema anti-bot de Liverpool (Akamai).

---

## Cambiar el producto o color a buscar

Sin tocar código, via variables de entorno:

```powershell
# PowerShell
$Env:SEARCH_TERM="nintendo switch"
$Env:FILTER_COLOR="Rojo"
npm test
```

```bash
# Bash
SEARCH_TERM="xbox series x" FILTER_COLOR="Negro" npm test
```

También acepta varios términos separados por coma con `SEARCH_TERMS`.

---

## Qué valida el test principal

1. Navega a Liverpool y busca el término configurado
2. Filtra por color
3. Ordena por menor precio
4. Intercepta la respuesta de red del estado final (`/api/plp/search`)
5. Extrae los primeros 5 productos visibles de la UI
6. Verifica que los precios estén en orden ascendente
7. Cruza esos 5 productos contra los datos de la API
8. Exige al menos 3/5 coincidencias y loguea cualquier discrepancia

---

## Bonuses incluidos

- **Regresión visual** — compara el layout de resultados contra un baseline (enmascara imágenes y precios para no fallar por cambios de catálogo)
- **Accesibilidad** — escaneo con axe-core en la página de resultados
- **Performance** — assert de tiempo de carga configurable via `PERF_BUDGET_MS`
- **Cross-browser** — Chromium, Firefox y WebKit en paralelo
- **Data-driven** — el mismo test corre con cualquier término sin cambiar código

```bash
# Primera vez: genera el baseline visual
npm run test:visual:update

# Comparar contra el baseline
npm run test:visual
```

---

## Estructura

```
src/
  data/         → términos y configuración de búsqueda
  fixtures/     → stealth fixture para evadir Akamai en CI
  models/       → tipos TypeScript
  pages/        → interacciones con la UI de Liverpool
  services/     → captura e interpretación de respuestas de red
  utils/        → normalización y comparación de productos
tests/
  search-products.spec.ts   → prueba principal (requerida)
  accessibility.spec.ts     → bonus
  performance.spec.ts       → bonus
  visual-regression.spec.ts → bonus
```

---

## CI

El pipeline en `.github/workflows/test.yml` instala dependencias, verifica TypeScript, corre los tests en headless y publica el reporte HTML como artifact. También permite generar o comparar el baseline visual via `workflow_dispatch`.
