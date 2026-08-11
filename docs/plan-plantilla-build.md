# Plan de build para la plantilla white-label

Números medidos el 2026-08-07 sobre `index.html` (commit `d2ce603`, 164.625
bytes, 4.378 líneas; 32.921 bytes gzip). Los CDN se bajaron con curl y se
pesaron en crudo y con `gzip -9` (≈ lo que viaja por la red).

## a) Inventario de código muerto en `index.html`

> **PURGADO el 2026-08-11** (commit "el bundle pierde sus 51 KB muertos"): los
> módulos Select/PriceCard/StatBlock/datos.js/Panel.jsx completos y las 8
> funciones reemplazadas por overrides — −51.601 B medidos, cero errores del
> bundle tras la cirugía. Las líneas de este inventario son del archivo previo.

El bloque de overrides (líneas 3768–4319) termina en
`Object.assign(window, { TurnosAsistente, Servicios, Cortes, Spa, ComoFunciona, Resenas, Horarios, Footer })`
(línea 4315): pisa 8 globales que el bundle ya había definido. Esos
originales se ejecutan en cada visita y nadie los vuelve a llamar:

| Código muerto | Líneas | Bytes | Por qué está muerto |
|---|---|---|---|
| `Footer` original (Chrome.jsx) | 1913–2021 | 3.292 | reemplazado en línea 4206 |
| `Servicios/Cortes/Spa/ComoFunciona/Horarios/Resenas` (Secciones.jsx) | 2073–2566 | 14.358 | los 6 reemplazados (4076–4314); solo `Faq` del bloque sigue vivo |
| `TurnosAsistente` original (Turnos.jsx) | 2678–3066 | 11.994 | reemplazado en línea 3854 |
| Copia interna de `DATA_911` (datos.js) | 3113–3272 | 5.134 | sobrescrita por el `window.DATA_911` explícito de la línea 3648 |
| `Panel.jsx` completo (`AppTurnos`) | 3273–3639 | 10.437 | jamás se monta; `/admin` tiene su propio código |
| `Select`, `PriceCard`, `StatBlock` (núcleo) | 774–847, 921–1006, 1179–1211 | 6.251 | 0 referencias fuera de su definición |
| **Total muerto** | | **51.466** | **49 % del bundle (104.671 B), 31 % del archivo** |

Resto del archivo: head+CSS 11.826 B · bundle vivo ~53 KB · `DATA_911`
explícito 5.154 B · fase-2 Supabase 3.280 B · overrides JSX 36.170 B ·
montaje JSX 2.491 B.

## b) Pesos reales de lo que carga el navegador

| `<script src>` (unpkg) | Crudo | Gzip |
|---|---|---|
| react@18.3.1 **development** | 109.931 | 28.242 |
| react-dom@18.3.1 **development** | 1.080.227 | 232.563 |
| @babel/standalone@7.29.0 min | 3.137.752 | 655.214 |
| lucide@0.454.0 umd min | 355.323 | 81.245 |
| aos@2.3.1 (sin minificar) | 14.239 | 4.509 |
| **Total CDN** | **4.697.472 (4,5 MB)** | **1.001.773 (0,96 MB)** |

Es decir: **~0,96 MB de transferencia y ~4,5 MB de JS a parsear** para servir
una landing cuyo propio HTML pesa 33 KB gzip. Dos tercios del costo son Babel
(que solo existe para compilar JSX en vivo) y las builds *development* de
React (la production.min pesa 142.586 B / 47.179 B gzip: 7,5× menos).

**Costo de Babel en runtime, medido**: compila 38.398 B de JSX (overrides +
montaje) en cada visita. En Node sobre Apple Silicon: 81 ms solo evaluar
`babel.min.js` + 201 ms compilar los dos bloques (salida: 50.455 B). En un
Android de gama media (4–8× más lento y en el hilo principal) son **~1–2 s de
bloqueo antes del primer render**, sumados a parsear los 3,1 MB de Babel. El
público objetivo entra por WhatsApp desde el celular: es el peor caso.

## c) Tres opciones

| | 1. Quedarse como está | 2. Precompilar overrides (Babel CLI, una vez) | 3. Build Vite como producto plantilla |
|---|---|---|---|
| Qué gana | Nada que mantener; editar y push | −655 KB gz (Babel) −213 KB gz (React prod) −50 KB muertos → **CDN pasa de 0,96 MB a ~133 KB gz** y desaparece el bloqueo de 1–2 s | Todo lo de 2 + lucide tree-shaken (~20 iconos ≈ pocos KB vs 355 KB), assets con hash, un comando genera N clientes con su tema/datos |
| Qué rompe | Sigue pagando 0,96 MB + compile por visita y por cliente vendido | El flujo "editar landing.html y push": tocar JSX exige `npm run build` (el contenido sigue editable vía Supabase sin build) | Todo el flujo actual: repo pasa a src/ + dist/, GitHub Pages necesita Action, el bundle de claude.ai/design se vendría como fuente |
| Esfuerzo | 0 | ~medio día: script npm + swap de 3 `<script>` + purga de muertos | 3–5 días + curva de mantenimiento |

## d) Recomendación

Alineada con el plan white-label (vender copias por barbería primero,
multi-tenant después): **opción 2 ya**, porque cada copia que se venda hereda
el ahorro sin cambiar la arquitectura ni el deploy, y el grueso del beneficio
(0,96 MB → ~133 KB, sin compile en el celular del cliente) se captura con
medio día de trabajo. La opción 3 se justifica recién con 2–3 barberías
reales pagando: ahí el costo de mantener N copias a mano supera el costo del
build, y la columna `tema` en `negocio` ya deja lista la vía multi-tenant.

Primeros 3 pasos:

1. **Purgar los 51.466 B muertos** de `landing.html` (Panel.jsx completo,
   los 8 originales reemplazados, la copia interna de `DATA_911`, y
   `Select`/`PriceCard`/`StatBlock`) y `cp landing.html index.html`. Riesgo
   nulo: nada vivo los referencia (verificado por grep de cada símbolo).
2. **Cambiar React a production.min** (`react.production.min.js` 10.751 B /
   `react-dom.production.min.js` 131.835 B, con SRI nuevo): −213 KB gzip sin
   tocar una línea de código propio.
3. **Precompilar los dos bloques `text/babel`** con
   `npx @babel/cli --presets=@babel/preset-react` (fuentes en `src/*.jsx`,
   script `npm run build:jsx` que inyecta la salida como `<script>` normal) y
   borrar el `<script>` de Babel: −655 KB gzip y −1–2 s de main-thread. Con
   esto la página queda en ~133 KB gz de CDN + ~25 KB gz de HTML.
