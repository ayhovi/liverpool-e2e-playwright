# Liverpool E2E Automation Challenge

[![E2E Tests](https://github.com/ayhovi/liverpool-e2e-playwright/actions/workflows/test.yml/badge.svg)](https://github.com/ayhovi/liverpool-e2e-playwright/actions/workflows/test.yml)

Framework minimalista con **Playwright + TypeScript** para automatizar búsqueda, filtro, ordenamiento y validación cruzada UI vs respuesta de red en Liverpool.

## Arquitectura

```text
.
├── .github/workflows/test.yml
├── src/
│   ├── data/search-data.ts
│   ├── models/product.ts
│   ├── pages/liverpool-search.page.ts
│   ├── services/network-product-collector.ts
│   └── utils/product-utils.ts
├── tests/
│   ├── search-products.spec.ts
│   ├── accessibility.spec.ts
│   ├── performance.spec.ts
│   └── visual-regression.spec.ts
├── playwright.config.ts
├── TEST_STRATEGY.md
├── package-lock.json
└── package.json
```

**Responsabilidades:** `pages/` contiene interacción y lectura de UI; `services/` captura respuestas JSON; `utils/` normaliza y compara datos; `tests/` expresa el comportamiento y las aserciones de negocio.

## Instalación

Requiere Node.js 20+.

```bash
npm ci
npx playwright install
```

La instalación anterior descarga Chromium, Firefox y WebKit administrados por Playwright. Para el flujo principal solo se ejecuta Chromium; los demás se usan en el bonus cross-browser.

## Ejecución

Headless por defecto:

```bash
npm test
```

Modo visible:

```bash
npm run test:headed
```

Debug:

```bash
npm run test:debug
```

Reporte HTML:

```bash
npm run report
```

Cross-browser (bonus):

```bash
npm run test:cross-browser
```

Validación de TypeScript:

```bash
npm run typecheck
```

Regresión visual (bonus):

```bash
# Primera vez: crea/actualiza el baseline
npm run test:visual:update

# Siguientes ejecuciones: compara contra el baseline versionado
npm run test:visual
```

La prueba visual usa un viewport fijo y enmascara el contenido dinámico de producto (texto/precio/imagen). Así valida el **layout** de resultados sin convertir cambios normales de catálogo en falsos positivos.

## Datos parametrizables

El escenario principal usa `playstation 5` y `Blanco`. Pueden cambiarse sin tocar código.

PowerShell:

```powershell
$Env:SEARCH_TERM="nintendo switch"
$Env:FILTER_COLOR="Blanco"
npm test
```

Bash:

```bash
SEARCH_TERM="nintendo switch" FILTER_COLOR="Blanco" npm test
```

También se aceptan varios términos separados por coma mediante `SEARCH_TERMS`.

## Flujo validado

1. Navega a Liverpool.
2. Busca el término configurado.
3. Filtra por color.
4. Reinicia la ventana de captura de red para descartar requests anteriores.
5. Ordena por **Menor precio**.
6. Intercepta la respuesta del estado final, priorizando `/api/plp/search`.
7. Extrae los primeros 5 productos **visibles** de la UI.
8. Verifica que sus precios estén realmente en orden ascendente.
9. Compara esos 5 productos contra los datos de red del mismo estado final.
10. Exige al menos 3/5 coincidencias y registra diferencias de nombre o precio.

## Comparación UI vs red

La identidad se compara en este orden:

- `productId`;
- `skuId`;
- cruce `productId` ↔ `skuId` cuando Liverpool representa una variante de forma diferente entre UI/API;
- similitud de nombre solo como fallback.

Una coincidencia de identidad cuenta para el requisito de **3 de 5**. Nombre y precio se validan por separado y cualquier diferencia se registra en consola y en los adjuntos JSON del HTML report.

El collector usa una ventana/generación de captura: una respuesta perteneciente a la búsqueda o filtro anterior no puede contaminar la validación aunque llegue tarde después de ordenar.

## Evidencias automáticas

Configuradas a nivel framework en `playwright.config.ts`:

- screenshot solo al fallar;
- trace retenido al fallar;
- HTML Reporter siempre generado.

El video está desactivado porque no es requisito y reduce el peso de los artefactos.

## Bonuses

Accesibilidad y performance están marcados `@optional` para que no bloqueen el pipeline principal:

```bash
npm run test:optional
```

La regresión visual también es opcional, pero tiene comandos separados porque necesita un baseline versionado (`npm run test:visual:update` / `npm run test:visual`). Para performance puede configurarse `PERF_BUDGET_MS`.

La regresión visual requiere un baseline versionado. Si el baseline se genera en GitHub Actions, usa **Actions → E2E Tests → Run workflow → visual_mode=update**, descarga el artifact `visual-baseline-linux`, copia su contenido a `tests/visual-regression.spec.ts-snapshots/` y haz commit. Luego puedes ejecutar el mismo workflow con `visual_mode=compare`.

## GitHub Actions

`.github/workflows/test.yml`:

- usa `npm ci` para una instalación reproducible;
- ejecuta `npm run typecheck`;
- instala Chromium y dependencias del sistema;
- ejecuta `npm test` en headless;
- publica `playwright-report/` como artifact incluso si la prueba falla;
- publica `test-results/` cuando existe un fallo;
- mediante `workflow_dispatch` permite generar o comparar el baseline visual sin convertirlo en gate del flujo obligatorio.

> El badge de la última ejecución está en la cabecera del README.
