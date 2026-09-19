# TEST_STRATEGY

## Objetivo y enfoque

La prueba valida el flujo desde dos puntos: lo que ve el usuario en la UI y los datos que recibe el frontend desde la red.No se usan productos ni precios fijos porque el catálogo de Liverpool puede cambiar. La prueba busca, filtra, ordena, toma los primeros 5 productos visibles y los compara con la respuesta de red correspondiente.

### 1. ¿Qué aspectos de este proceso no automatizarías y por qué?

No automatizaría pagos reales, inventario por tienda, promociones externas ni todas las combinaciones posibles de filtros.

Son escenarios más costosos y variables, y no aportan directamente al objetivo de esta prueba.Tampoco validaría productos, precios, banners o promociones específicas, porque son datos que pueden cambiar constantemente..

### 2. Si Liverpool añadiera un CAPTCHA, ¿cómo lo manejarías?

No intentaría evadirlo desde la automatización.En un ambiente de pruebas solicitaría una opción autorizada para omitirlo, como una test key, feature flag o allowlist para CI.

El CAPTCHA podría validarse por separado, mientras que el flujo funcional seguiría ejecutándose sin depender de resolverlo automáticamente.

### 3. ¿Qué riesgos de inestabilidad existen y cómo los mitigaste?

Los principales riesgos son productos y precios dinámicos, carga lenta, popups, elementos ocultos y respuestas de red que pueden tardar.Para reducir estos problemas uso esperas por estado, elementos visibles, datos obtenidos en la misma ejecución y screenshots/traces cuando ocurre un error.También valido que los productos realmente queden ordenados de menor a mayor.

### 4. ¿Qué cambiarías si se ejecutara junto con más de 50 suites en CI?

Separaría las pruebas rápidas de las pruebas más pesadas.En cada Pull Request ejecutaría el flujo principal en Chromium y dejaría cross-browser, accesibilidad, performance y regresión visual para ejecuciones programadas. También usaría paralelismo y sharding para reducir el tiempo total del pipeline.
