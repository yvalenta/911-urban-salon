-- ═══════════════════════════════════════════════════════════════════════════
-- 12_reservas_landing.sql — Fase 3: la landing lee la cola y reserva de verdad
--
-- Hasta ahora la disponibilidad del asistente público era SIMULADA (un hash
-- determinista) y la reserva terminaba en un mensaje de WhatsApp: a las 2:50pm
-- ofrecía las 12:00, no veía la cola real, y dos visitantes podían "reservar"
-- el mismo hueco. Estas dos funciones lo arreglan en el servidor:
--
--   cola_publica(dia)   → lo que cualquiera puede ver de la cola (lo mismo que
--                         muestra la pantalla de sala del local): código,
--                         barbero, estado, hora, duración y servicios. NUNCA
--                         cliente ni teléfono — eso es dato personal.
--   reservar_turno(...) → crea el turno en estado 'espera' con control de
--                         choques: candado consultivo por barbero+día (dos
--                         requests simultáneos se atienden en fila) + rechazo
--                         de solape contra los turnos activos + código único
--                         generado aquí (respaldado por el índice único
--                         turnos_fecha_codigo_key de db/10).
--
-- Ambas son SECURITY DEFINER a propósito: la RLS de turnos no da SELECT ni
-- INSERT al rol anon, y abrirla expondría cliente/teléfono. El definer deja
-- pasar solo por estas dos puertas angostas, que validan todo lo que entra.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La cola que ve el público ──────────────────────────────────────────────
create or replace function public.cola_publica(dia date)
returns table (codigo text, barbero_nombre text, estado text, hora time,
               dur_min int, servicios text, iniciado_en timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select codigo, barbero_nombre, estado, hora, dur_min, servicios, iniciado_en
    from public.turnos
   where fecha = dia
     and estado in ('espera','silla','pausado')
   order by hora, orden;
$$;

comment on function public.cola_publica(date) is
  'Cola activa del día sin datos personales, para la landing. SECURITY DEFINER: es la vista pública de la pantalla de sala.';

-- ── Reservar desde la landing ──────────────────────────────────────────────
create or replace function public.reservar_turno(
  p_cliente   text,
  p_telefono  text,
  p_servicios text,
  p_barbero   text,
  p_fecha     date,
  p_hora      time,
  p_dur       int,
  p_precio    int
) returns table (codigo text, posicion int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_horario   jsonb;
  v_apertura  int;
  v_fin       int;
  v_codigo    text;
  v_num       int;
  v_barbero_id uuid;
  v_posicion  int;
begin
  -- Validaciones de forma: esto lo llama cualquiera desde internet.
  if length(trim(coalesce(p_cliente, ''))) < 2 or length(p_cliente) > 60 then
    raise exception 'Nombre inválido';
  end if;
  if p_telefono !~ '^[0-9]{7,15}$' then
    raise exception 'Teléfono inválido: solo dígitos (7 a 15)';
  end if;
  if length(trim(coalesce(p_servicios, ''))) < 2 or length(p_servicios) > 200
     or length(coalesce(p_barbero, '')) < 2 or length(p_barbero) > 60 then
    raise exception 'Datos del turno inválidos';
  end if;
  if p_dur is null or p_dur < 15 or p_dur > 360 then
    raise exception 'Duración fuera de rango';
  end if;
  if p_fecha is null or p_fecha < current_date - 1 or p_fecha > current_date + 14 then
    -- current_date es UTC y el salón vive en UTC-5: se acepta desde "ayer" UTC
    -- para no rechazar reservas nocturnas locales, y máximo dos semanas.
    raise exception 'Fecha fuera de rango';
  end if;

  -- El horario vigente sale de negocio (editable en /admin), no de constantes.
  select horario into v_horario from public.negocio limit 1;
  v_apertura := coalesce((v_horario->>'apertura')::int, 12);
  v_fin      := coalesce((v_horario->>'fin')::int, 21);
  if extract(dow from p_fecha) = 2 then
    raise exception 'Los martes el salón está cerrado';
  end if;
  if p_hora < make_time(v_apertura, 0, 0)
     or (p_hora + make_interval(mins => p_dur)) > make_time(v_fin, 0, 0) then
    raise exception 'Hora fuera del horario de atención';
  end if;

  -- Candado por barbero+día: si dos visitantes reservan a la vez, el segundo
  -- espera a que el primero termine y su chequeo de solape ya lo ve. Es un
  -- advisory lock transaccional: se suelta solo al hacer commit/rollback.
  perform pg_advisory_xact_lock(hashtext(p_barbero || '·' || p_fecha::text));

  -- Rechazo de solape contra los turnos ACTIVOS del mismo barbero. Los
  -- cancelados y atendidos no bloquean. El intervalo es [hora, hora+dur).
  if exists (
    select 1 from public.turnos t
     where t.fecha = p_fecha
       and t.barbero_nombre = p_barbero
       and t.estado in ('espera','silla','pausado')
       and t.hora < (p_hora + make_interval(mins => p_dur))
       and (t.hora + make_interval(mins => coalesce(t.dur_min, 45))) > p_hora
  ) then
    raise exception 'Ese horario acaba de ocuparse — elige otro';
  end if;

  -- Código del día, generado en el servidor con la misma numeración del panel
  -- (arranca en A-014). El índice único de db/10 es el respaldo si dos días
  -- compiten; el candado de arriba ya serializa dentro del mismo barbero.
  select coalesce(max(nullif(regexp_replace(t.codigo, '\D', '', 'g'), '')::int), 13) + 1
    into v_num
    from public.turnos t where t.fecha = p_fecha;
  v_codigo := 'A-' || lpad(v_num::text, 3, '0');

  -- Si el barbero tiene cuenta en el panel, el turno queda a su nombre y él
  -- puede gestionarlo desde "Mi día" (la masajista aún no tiene cuenta: null).
  select u.id into v_barbero_id
    from auth.users u
   where u.raw_app_meta_data->>'nombre' = p_barbero
   limit 1;

  insert into public.turnos (codigo, cliente, telefono, servicios, precio_total,
                             dur_min, barbero_id, barbero_nombre, fecha, hora, estado)
  values (v_codigo, trim(p_cliente), p_telefono, trim(p_servicios), p_precio,
          p_dur, v_barbero_id, p_barbero, p_fecha, p_hora, 'espera');

  -- Posición en la fila del barbero (1 = el próximo en pasar).
  select count(*) into v_posicion
    from public.turnos t
   where t.fecha = p_fecha and t.barbero_nombre = p_barbero
     and t.estado in ('espera','silla','pausado') and t.hora <= p_hora;

  return query select v_codigo, v_posicion;
end;
$$;

comment on function public.reservar_turno(text, text, text, text, date, time, int, int) is
  'Reserva desde la landing: valida, serializa por barbero+día (advisory lock), rechaza solapes y genera el código. SECURITY DEFINER: la puerta angosta que la RLS no abre.';

-- ── Permisos: estas dos son EL API público de la landing ──────────────────
revoke all on function public.cola_publica(date) from public;
revoke all on function public.reservar_turno(text, text, text, text, date, time, int, int) from public;
grant execute on function public.cola_publica(date) to anon, authenticated;
grant execute on function public.reservar_turno(text, text, text, text, date, time, int, int) to anon, authenticated;

select 'fase 3 aplicada' as resultado;
