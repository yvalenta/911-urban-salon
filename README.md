# 911 Urban Salón — Sitio web y panel de turnos

Landing pública y panel administrativo de turnos de la barbería **911 Urban Salón**
("Tu belleza, nuestra emergencia"): barbería, spa y masajes, de miércoles a lunes.

| Superficie | URL | Qué es |
|---|---|---|
| Landing | https://911-urban-salon.ynt.codes | Página pública: carta de servicios, equipo, horarios y asistente de turnos con asignación automática |
| Panel admin | https://911-urban-salon.ynt.codes/admin | Cola del día en vivo, caja y resumen, productos, pantalla de sala y edición de la página pública (requiere login) |

---

## Estructura del repositorio

```
├── index.html            ← página pública (ÚNICO original; editar aquí)
├── landing.html          ← solo redirige a / (por enlaces viejos)
├── admin/
│   └── index.html        ← panel administrativo (sirve en /admin)
├── admin.html            ← solo redirige a /admin/
├── assets/               ← imágenes de marca que usa el sitio
│   ├── logo-911-urban-salon-dark.png / -light.png
│   ├── logo-911-graffiti-tag.png
│   ├── icon-barber-pole.png
│   ├── texture-graffiti-black.jpeg
│   └── servicios/        ← fotos de los cortes (skin-fade, wolf-cut, crop-, fade-texturizado)
├── images/optimized/     ← flyers fuente comprimidos (no los usa el sitio; origen de assets/)
├── CNAME                 ← dominio de GitHub Pages (911-urban-salon.ynt.codes)
└── .claude/launch.json   ← servidor local de prueba (python http.server 8931)
```

> `landing.html` fue una copia exacta de `index.html` que había que sincronizar
> a mano; desde 2026-08-06 **`index.html` es el único original** y `landing.html`
> solo redirige.

## Arquitectura

Sitio **estático sin build step** (GitHub Pages) + **Supabase** como backend
(Postgres, Auth, Realtime y Storage). Son dos aplicaciones:

- **`index.html`** — la página pública, construida sobre el
  bundle del design system (estructura abajo).
- **`admin/index.html`** — el panel: app React propia (estilo dashboard) con
  `supabase-js` por CDN; no usa el bundle del design system.

La landing es autocontenida y lleva, en orden:

1. **Tokens CSS** del design system (colores, tipografía, espaciado, efectos) +
   una capa responsive al final del `<style>`.
2. **CDNs**: React 18, Babel standalone, Lucide (iconos), AOS (animaciones al
   hacer scroll — solo la landing) y Google Fonts (Anton, Barlow, Barlow
   Condensed, Permanent Marker).
3. **Bundle del design system** (`<script>` precompilado): los 18 componentes
   (Button, Card, Badge, ServiceCard, SlotPicker, TurnoTicket…) y las secciones
   compiladas de la página. *Nota de mantenimiento:* en este bundle los exports
   del namespace (`__ds_ns.X = …`) están **antes** de los bloques `ui_kits/` —
   si se regenera desde el proyecto de diseño hay que conservar ese orden, o las
   secciones capturan `undefined`.
4. **Datos de respaldo** (`window.DATA_911`): el contenido embebido que se
   muestra si la base no responde.
5. **Sincronizador de contenido**: fetch anónimo a las tablas `negocio` y
   `servicios` al cargar (espera hasta ~1.2 s antes de montar; si llega más
   tarde, re-renderiza). Mapea las filas al formato de `DATA_911` y rearma
   los textos de prosa que citan precios u horarios.
6. **Overrides** (`<script type="text/babel">`): versiones mejoradas de
   TurnosAsistente (multiservicio), Cortes, Spa, Horarios y Footer que
   reemplazan a las del bundle. El montaje final renderiza `<App/>`.

El diseño proviene del proyecto **"911 Urban Salón Design System"** en
claude.ai/design (id `1e06a957-8ab0-4045-96ed-9726db0626f4`). La API de ese
proyecto trunca archivos a 256 KiB, por lo que las imágenes de `assets/` se
reconstruyeron desde los flyers de `images/` (la textura es un recorte exacto
del collage; el logo es el lockup en papel).

## Contenido editable

**Desde la fase 2 el contenido vive en Supabase** y se edita en `/admin` →
**Ajustes** (rol admin): contacto (nombre, WhatsApp, dirección), horario,
equipo visible y la carta completa (precios, duraciones, descripciones,
visibilidad, servicios nuevos y **fotos de los cortes**, que se suben a
Supabase Storage). Guardar = publicar: la landing lee las tablas `negocio` y
`servicios` con la anon key al cargar.

El objeto `window.DATA_911` de `index.html` queda como **respaldo**: es lo
que se muestra si la base no responde (y lo que ve un visitante sin conexión
momentánea). Tras cambios grandes conviene actualizarlo para que el respaldo
no quede viejo. Campos:

- `telefono` — WhatsApp en formato internacional sin signos (`573205042058`).
- `direccion` — Cra. 32, Mall La Visitación, Transversal Inferior — El Poblado, Medellín.
- `horario` — `dias`, `etiqueta` (texto visible), `apertura`/`fin` (horas 0-23
  que generan las franjas del asistente), `cierre`, `nota`.
- `cortes`, `spa`, `barberia` — la carta: `nombre`, `precio`, `dur` y opcional
  `estado`. Los `cortes` además llevan `img` (archivo en `assets/servicios/`),
  `desc` y opcional `badge`.
- `equipo` — `nombre`, `rol` (los roles con "Masajista" atienden el spa),
  `especialidad`, `estado` (`libre`/`turno`/`ocupado`) y `proximo`.
- `categorias`, `facial`, `flujo`, `resenas`, `faq` — textos de las secciones.

### Estados de un servicio

| `estado` | En la página pública | En el asistente |
|---|---|---|
| *(sin estado)* o `disponible` | normal | reservable |
| `agotado` | visible, atenuado, "No disponible" | no reservable |
| `borrador` | **oculto** | no aparece |

### Reglas del asistente de turnos

- Se pueden combinar varios servicios en un turno; **solo un corte** (elegir un
  segundo corte reemplaza al primero). Muestra total y duración sumada.
- Franjas cada 45 min entre `horario.apertura` y `horario.fin`; los martes se
  omiten. La ocupación es **simulada** (hash determinista) — ver "Limitaciones".
- "Enviar por WhatsApp" abre el chat del salón con el detalle del turno
  (nombre, código, servicios, total, barbero, día, hora y celular del cliente).

## Panel administrativo (`/admin`) — en vivo con Supabase

Desde la fase 1 el panel es un **dashboard conectado a Supabase** (proyecto
`ssrrkcshhrggukknkoua`): la cola de turnos es compartida entre todos los
dispositivos en tiempo real (Postgres + RLS + Realtime), con login real.

La sincronización está pensada para volumen alto: cada evento de Realtime se
aplica **incrementalmente** sobre la lista en memoria (sin recargar el día
completo por evento); el refetch queda para la carga inicial, la reconexión
del canal, el regreso de la app al frente (websocket dormido con pantalla
bloqueada), la recuperación de red y un resync de respaldo cada 2 min. Los
minutos transcurridos se calculan de timestamps del servidor, así que todos
los dispositivos ven el mismo tiempo.

**Cuentas** (correo sintético `usuario@911urban.local`):
- Admin: usuario `admin`, contraseña `911urban`.
- Barberos (rol limitado): usuario = su nombre (`samuel`, `mateo`, `julian`),
  contraseña compartida inicial `911corte`.

**Rol admin** — vistas Cola / Resumen / Productos / Sala / Ajustes: tabla del
día con minutos transcurridos, Llamar, pausar/reanudar, adelantar/retrasar,
reagendar, eliminar, correr citas, "Siguiente turno" y "Nuevo turno".
"Terminar" abre la **confirmación de atención** (valor del servicio +
productos vendidos), reversible con "Devolver confirmación"; "No atendido"
saca el turno con motivo opcional. **Resumen** totaliza el día: atendidos,
no atendidos con motivos, $ servicios, $ productos (ventas anulables) y
total. **Productos** es el catálogo administrable (gel, cera, etc.).

**Rol barbero** — vista "Mi día": solo su fila, turno actual en grande con
minutos, Empezar siguiente / Pausar / Terminar (con confirmación de atención
y productos) / No atendido / Devolver, y "Vender producto" suelto. RLS
impide tocar turnos ajenos; cada venta queda a nombre de quien la registró.

**Sala** (ambos roles) — monitor para el local: turno en silla en gigante y
la fila del día.

**Ajustes** (rol admin) — edita la página pública; ver "Contenido editable".

### Base de datos (Supabase, proyecto `ssrrkcshhrggukknkoua`)

| Tabla | Qué guarda | Escritura |
|---|---|---|
| `turnos` | Cola del día: estados espera/silla/pausado/listo/cancelado, tiempos, motivo de no atención | admin; barbero solo sus turnos |
| `productos` | Catálogo comercializable (gel, cera…) | admin |
| `ventas` | Ventas de productos del día, ligadas o no a un turno | inserta quien vende; anula admin |
| `negocio` | Fila única: nombre, WhatsApp, dirección, horario, equipo (y `tema`, reservado) | admin |
| `servicios` | La carta pública: categoría, precio, duración, estado, foto | admin |

Todas con RLS (rol desde `app_metadata` del JWT — no editable por el usuario)
y en la publicación Realtime. `negocio` y `servicios` se leen anónimamente
(son el contenido público). El bucket de Storage `publico` guarda las fotos
subidas desde Ajustes: lectura pública, escritura solo admin.

**Cambiar una contraseña** (requiere `.env` local con `DATABASE_URL`):

```bash
source .env && psql "$DATABASE_URL" -c "update auth.users set encrypted_password = crypt('NUEVA_CLAVE', gen_salt('bf')) where email = 'admin@911urban.local';"
```

**Secretos:** `.env` (ignorado por git) guarda la conexión a Postgres y las
llaves; en el HTML solo va la publishable key, que es pública por diseño
(los datos los protege RLS).

## Despliegue

- **Hosting:** GitHub Pages del repo `yvalenta/911-urban-salon`, rama `main`,
  raíz `/`. **Publicar = hacer push a `main`** (el sitio tarda ~1 min en actualizar).
- **Dominio:** archivo `CNAME` + registro DNS en Cloudflare (zona `ynt.codes`):
  `911-urban-salon` → CNAME → `yvalenta.github.io`, modo **DNS only**.
- **HTTPS:** certificado emitido por GitHub con "Enforce HTTPS" activado.
- **Prueba local:**

```bash
python3 -m http.server 8931
```

y abrir `http://localhost:8931/` (o `/admin/`).

## Tareas de mantenimiento comunes

| Tarea | Cómo |
|---|---|
| Cambiar precio/servicio/horario/teléfono/dirección | `/admin` → **Ajustes** → "Guardar y publicar" (sin tocar código) |
| Ocultar un servicio o marcarlo no disponible | Ajustes → Carta → clic en la etiqueta de visibilidad (Visible → No disponible → Borrador) |
| Nueva foto de corte | Ajustes → Carta · Cortes → botón **Foto** (se sube a Storage, máx 2.5 MB) |
| Renombrar el equipo visible en la página | Ajustes → "Equipo en la página" |
| Cambiar contraseña del panel | `psql` (ver sección del panel) |
| Actualizar el contenido de respaldo | `ruby ops/regenerar_respaldo.rb` (reescribe el bloque `DATA_911` de `index.html` desde la base) |

## Limitaciones conocidas

- La disponibilidad de franjas del asistente público sigue **simulada** y las
  reservas de clientes desde la landing no escriben en la base (fase 3 — hoy
  llegan por WhatsApp y el admin las crea con "Nuevo turno").
- La landing lee el contenido al cargar (no se re-renderiza en vivo mientras
  el visitante mira la página; basta recargar).

## Pendientes

- [ ] Nombre real de la masajista (hoy "Masajista por confirmar") — ya editable en Ajustes → Equipo.
- [ ] Contraseña definitiva del panel.
- [ ] Duraciones reales de trenzas/tintura/afeitado (90/90/30 min son estimadas) — editables en Ajustes.
- [ ] Fase 3: reservas reales desde la landing.
- [ ] White-label: paletas de color y logo editables (columna `tema` en `negocio` ya reservada).
