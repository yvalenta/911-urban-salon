-- ═══════════════════════════════════════════════════════════════════════════
-- 11_rpc_cola.sql — RPCs atómicos para la cola de turnos del panel /admin
--
-- Por qué existen: hoy el panel hace estas dos operaciones con varios UPDATE
-- sueltos desde el navegador (admin/index.html):
--   · mover  → 2 UPDATEs para intercambiar hora+orden de dos turnos adyacentes
--   · correr → 1 UPDATE por turno en espera, en un loop, para sumarle minutos
-- Si la conexión se cae (o RLS rechaza) a mitad de camino, la cola queda a
-- medias: un turno movido y el otro no, o solo parte de las citas corridas.
-- Una función de Postgres corre entera dentro de UNA transacción: o se aplica
-- todo o no se aplica nada.
--
-- Seguridad: ambas funciones son SECURITY INVOKER (el valor por defecto, aquí
-- explícito a propósito). Un UPDATE dentro de una función invoker se ejecuta
-- con el rol y el JWT del que llama, así que las políticas RLS de
-- public.turnos se aplican IGUAL que si el navegador hiciera el UPDATE
-- directo: solo el admin (jwt_rol() = 'admin') o el barbero dueño
-- (barbero_id = auth.uid()) tocan filas. RLS solo se saltaría con SECURITY
-- DEFINER, o si el dueño de la tabla no tiene FORCE ROW LEVEL SECURITY y
-- llama él mismo — ninguno de los dos casos aplica aquí.
--
-- Detalle clave con RLS: un UPDATE sobre una fila que la política no permite
-- NO falla, simplemente afecta 0 filas en silencio. Por eso
-- intercambiar_turnos cuenta las filas afectadas y lanza excepción si no son
-- exactamente 2: la excepción revierte la transacción completa y evita el
-- intercambio a medias (que es justo el bug que venimos a matar).
--
-- Idempotente: create or replace en ambas; el archivo se puede re-ejecutar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Intercambiar dos turnos ────────────────────────────────────────────────
-- Intercambia hora y orden entre los turnos a y b en un ÚNICO UPDATE con
-- auto-join: cada fila destino (t) toma hora/orden de la otra fila (o).
-- Al ser una sola sentencia, ambas filas se leen del mismo snapshot del
-- inicio de la sentencia: no hay estado intermedio ni "pisado" de valores.
create or replace function public.intercambiar_turnos(a uuid, b uuid)
returns void
language plpgsql
security invoker
-- search_path vacío: todo va calificado con su esquema; evita que un esquema
-- ajeno en el path del invocador secuestre nombres (pg_catalog siempre se
-- busca implícitamente, por eso make_interval etc. no necesitan prefijo).
set search_path = ''
as $$
declare
  n integer;
begin
  if a is null or b is null or a = b then
    raise exception 'Se necesitan dos turnos distintos para intercambiar';
  end if;

  update public.turnos t
     set hora  = o.hora,
         orden = o.orden
    from public.turnos o
   where t.id in (a, b)
     and o.id in (a, b)
     and o.id <> t.id;   -- cada turno toma los valores del OTRO

  -- RLS filtra en silencio las filas que el invocador no puede actualizar
  -- (y también las que no puede leer vía el alias o). Si no se afectaron
  -- exactamente 2 filas — turno inexistente, de otro barbero, etc. — la
  -- excepción revierte todo: nunca queda medio intercambio.
  get diagnostics n = row_count;
  if n <> 2 then
    raise exception 'Sin permiso o turno inexistente: no se intercambió nada (filas afectadas: %)', n;
  end if;
end;
$$;

comment on function public.intercambiar_turnos(uuid, uuid) is
  'Intercambia hora y orden entre dos turnos en una sola transacción. SECURITY INVOKER: RLS decide quién puede.';

-- ── Correr todas las citas en espera de un día ─────────────────────────────
-- Suma `minutos` a la hora de TODOS los turnos en espera de `dia` en un solo
-- UPDATE (el loop del navegador hacía N peticiones). Devuelve cuántos afectó,
-- que con RLS puede ser menos que los visibles: el conteo que muestra el
-- panel pasa a ser el real.
--
-- Wrap de medianoche: en el JS actual deMin() hace módulo 1440
-- (((m % 1440) + 1440) % 1440), es decir 23:50 + 20 min → 00:10. En Postgres
-- `time + interval` da la vuelta a las 24 h de forma nativa con la misma
-- semántica, así que no hace falta aritmética manual (y además maneja bien
-- minutos negativos, donde el `m % 60` del JS tiene un bug latente).
create or replace function public.correr_citas(dia date, minutos integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if dia is null or minutos is null or minutos = 0 then
    return 0;  -- nada que correr; evita un UPDATE vacío
  end if;

  update public.turnos
     set hora          = hora + make_interval(mins => minutos),
         -- En un SET todas las expresiones ven la fila VIEJA, así que este
         -- coalesce guarda la hora previa al corrimiento solo la primera vez,
         -- igual que el `t.hora_original || t.hora` del JS.
         hora_original = coalesce(hora_original, hora)
   where fecha  = dia
     and estado = 'espera';

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.correr_citas(date, integer) is
  'Corre +minutos la hora de todos los turnos en espera de un día (una transacción). Devuelve filas afectadas. SECURITY INVOKER: RLS decide quién puede.';

-- ── Permisos ───────────────────────────────────────────────────────────────
-- Postgres da EXECUTE a PUBLIC por defecto al crear una función; lo retiramos
-- para que solo usuarios autenticados la invoquen. No es la barrera real (la
-- RLS ya deja a anon sin filas que tocar), pero corta llamadas anónimas de
-- entrada y no ensucia los logs con intentos vacíos.
revoke execute on function public.intercambiar_turnos(uuid, uuid) from public, anon;
revoke execute on function public.correr_citas(date, integer)    from public, anon;
grant  execute on function public.intercambiar_turnos(uuid, uuid) to authenticated;
grant  execute on function public.correr_citas(date, integer)     to authenticated;
