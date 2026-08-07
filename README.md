# 911 Urban Salón — Sitio web y panel de turnos

Landing pública y panel administrativo de turnos de la barbería **911 Urban Salón**
("Tu belleza, nuestra emergencia"): barbería, spa y masajes, de miércoles a lunes.

| Superficie | URL | Qué es |
|---|---|---|
| Landing | https://911-urban-salon.ynt.codes | Página pública: carta de servicios, equipo, horarios y asistente de turnos con asignación automática |
| Panel admin | https://911-urban-salon.ynt.codes/admin | Cola del día, pantalla de sala y edición de carta/horarios/equipo (requiere login) |

---

## Estructura del repositorio

```
├── index.html            ← página pública (COPIA EXACTA de landing.html)
├── landing.html          ← misma página; archivo de trabajo original
├── admin/
│   └── index.html        ← panel administrativo (sirve en /admin)
├── admin.html            ← solo redirige a /admin/
├── assets/               ← imágenes de marca que usa el sitio
│   ├── logo-911-urban-salon-dark.png / -light.png
│   ├── logo-911-graffiti-tag.png
│   ├── icon-barber-pole.png
│   ├── texture-graffiti-black.jpeg
│   └── servicios/        ← fotos de los cortes (skin-fade, wolf-cut, crop-, fade-texturizado)
├── images/               ← flyers fuente de la marca (no los usa el sitio; son el origen de assets/)
├── CNAME                 ← dominio de GitHub Pages (911-urban-salon.ynt.codes)
└── .claude/launch.json   ← servidor local de prueba (python http.server 8931)
```

> ⚠️ **`index.html` y `landing.html` deben ser idénticos.** Tras editar
> `landing.html`, ejecuta `cp landing.html index.html` antes de commitear.

## Arquitectura

Sitio **estático sin build step**. Cada HTML es autocontenido y lleva, en orden:

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
4. **Datos** (`window.DATA_911`): todo el contenido editable del sitio.
5. **Overrides** (`<script type="text/babel">`, solo la landing): versiones
   mejoradas de TurnosAsistente (multiservicio), Cortes, Spa, Horarios y Footer
   que reemplazan a las del bundle. El montaje final renderiza `<App/>`.

El diseño proviene del proyecto **"911 Urban Salón Design System"** en
claude.ai/design (id `1e06a957-8ab0-4045-96ed-9726db0626f4`). La API de ese
proyecto trunca archivos a 256 KiB, por lo que las imágenes de `assets/` se
reconstruyeron desde los flyers de `images/` (la textura es un recorte exacto
del collage; el logo es el lockup en papel).

## Contenido editable (`window.DATA_911`)

Vive dentro de `landing.html` (bloque «Datos de contenido») y se copia también
en `admin/index.html`. Campos:

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

## Panel administrativo (`/admin`)

Login inicial: usuario **`admin`**, contraseña **`911urban`**. Tres vistas:

- **Pantalla de sala** — monitor para el local: turno en silla en gigante y la fila.
- **Panel del barbero** — cola del día con *Llamar*/*Terminar*, botón
  **"Siguiente turno"**, y **"¿El turno se alargó?"** (+10/+15/+30 min) que corre
  las citas en espera mostrando la hora original tachada y el retraso acumulado.
  El equipo se puede **renombrar** (lápiz).
- **Servicios** — horario de atención editable y carta por categorías: editar
  nombre/precio/duración, crear o eliminar servicios y ciclar su estado
  (Visible → No disponible → Borrador) con un clic en la etiqueta.

**Cambiar la contraseña:** el panel guarda solo el SHA-256 de `usuario:contraseña`
en la constante `HASH_ACCESO` de `admin/index.html`. Genera el nuevo hash con:

```bash
python3 -c "import hashlib; print(hashlib.sha256('admin:NUEVA_CLAVE'.encode()).hexdigest())"
```

y reemplaza el valor de `HASH_ACCESO`.

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
| Cambiar precio/servicio/horario/teléfono | Editar `DATA_911` en `landing.html`, `cp landing.html index.html`, replicar el bloque de datos en `admin/index.html`, commit y push |
| Ocultar un servicio o marcarlo no disponible | Añadir `estado: "borrador"` o `estado: "agotado"` al servicio en `DATA_911` |
| Nueva foto de corte | Subir el JPEG a `assets/servicios/` y referenciarla en `cortes[].img` (sin extensión) |
| Cambiar contraseña del panel | Ver sección del panel (regenerar `HASH_ACCESO`) |
| Renombrar barberos "de verdad" | Editar `equipo` en `DATA_911` (lo del panel es solo local) |

## Limitaciones conocidas (demo sin backend)

- **No hay servidor.** El login del panel es un candado del lado del cliente
  (disuade, no protege), y **todo lo que se edita en el panel se guarda en
  `localStorage` de ese navegador**: no cambia la página pública ni se comparte
  entre dispositivos.
- La cola de turnos del panel y la disponibilidad de franjas del asistente son
  **simuladas**; los turnos confirmados no se registran en ningún lado (el
  cliente los envía por WhatsApp).
- Para reservas reales y compartidas (bloqueo de franjas por duración, cola en
  vivo multi-dispositivo, ediciones del panel publicadas al instante) el paso
  siguiente es un backend — p. ej. Supabase — manteniendo estos mismos tokens y
  componentes.

## Pendientes

- [ ] Nombre real de la masajista (hoy "Masajista por confirmar").
- [ ] Contraseña definitiva del panel.
- [ ] Duraciones reales de trenzas/tintura/afeitado (90/90/30 min son estimadas).
- [ ] Backend de reservas (opcional).
