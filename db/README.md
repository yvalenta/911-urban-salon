# Esquema de la base (Supabase)

Las migraciones aplicadas al proyecto `ssrrkcshhrggukknkoua`, en orden. Este
directorio existe para poder **reconstruir el proyecto desde cero** (y para que
la futura plantilla white-label tenga su esquema como producto) — la base de
producción no es la única copia del esquema.

| Archivo | Qué crea | Aplicada |
|---|---|---|
| `01_fase1_cola_y_roles.sql` | `turnos` + RLS por rol (`jwt_rol()`), Realtime, cuentas seed | 2026-08-06 |
| `02_fase1_5_caja_y_productos.sql` | `productos`, `ventas`, `turnos.motivo_no_atencion` | 2026-08-06 |
| `03_fase2_contenido.sql` | `negocio`, `servicios`, bucket Storage `publico`, semilla de contenido | 2026-08-06 |
| `10_unique_codigo_turno.sql` | `unique (fecha, codigo)` en `turnos` — mata la carrera de códigos A-0XX | 2026-08-07 |
| `11_rpc_cola.sql` | RPCs atómicos `intercambiar_turnos` y `correr_citas` (ver `11_rpc_cola.parche.md`) | 2026-08-07 |
| `12_reservas_landing.sql` | Fase 3: `cola_publica` (cola saneada para anon) y `reservar_turno` (reserva con candado y anti-solape) | 2026-08-10 |

## Cómo aplicar

```bash
source .env && psql "$DATABASE_URL" -f db/01_fase1_cola_y_roles.sql
```

(El host directo de Supabase es IPv6-only; `DATABASE_URL` usa el pooler IPv4
`aws-0-us-east-1.pooler.supabase.com:5432` con usuario `postgres.<ref>`.)

## Reglas

- **Idempotentes**: todas usan `if not exists` / `create or replace` /
  `drop policy if exists` — correrlas dos veces no duele.
- **Sin claves reales**: el repo es público. Las contraseñas de semilla son
  marcadores `CAMBIA_CLAVE_*`; al aplicar en un proyecto nuevo, reemplázalas y
  luego rota con `crypt('NUEVA', gen_salt('bf'))` (ver README raíz).
- **Fechas explícitas**: `current_date` en el servidor es UTC y el panel usa
  fecha local — todo insert de `turnos`/`ventas` lleva `fecha` explícita.
- Cambios nuevos = archivo nuevo numerado; no se editan los ya aplicados.
