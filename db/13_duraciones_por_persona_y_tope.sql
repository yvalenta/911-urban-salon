-- ═══════════════════════════════════════════════════════════════════════════
-- 13_duraciones_por_persona_y_tope.sql — cada servicio tarda según quién lo
-- hace, y las reservas web tienen tope de 3 horas.
--
-- `servicios.duraciones` es un mapa persona→minutos ({"Samuel":40,"Mateo":60});
-- vacío o sin la persona = aplica `dur_min` (la base). Se edita en /admin →
-- Ajustes → Editar servicio.
--
-- `reservar_turno` deja de confiar en la duración que manda el navegador:
-- parte `p_servicios` por " + ", busca cada nombre en la carta y suma la
-- duración DE ESE BARBERO. Solo si algún nombre no calza (carta editada a
-- mitad de reserva) usa la duración del cliente. En ambos casos, tope de
-- 180 min: un visitante anónimo no puede bloquearle la agenda 5 horas a
-- nadie (pasó: un combo de 4 servicios reservó 300 min de una).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.servicios add column if not exists duraciones jsonb;

comment on column public.servicios.duraciones is
  'Minutos por persona ({"Samuel":40}); sin entrada aplica dur_min.';

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
  v_horario    jsonb;
  v_apertura   int;
  v_fin        int;
  v_codigo     text;
  v_num        int;
  v_barbero_id uuid;
  v_posicion   int;
  v_dur        int;
  v_calculada  int := 0;
  v_todo_calza boolean := true;
  v_nombre     text;
  v_min        int;
begin
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
  if p_fecha is null or p_fecha < current_date - 1 or p_fecha > current_date + 14 then
    raise exception 'Fecha fuera de rango';
  end if;

  -- La duración de verdad se calcula AQUÍ, por barbero: la del navegador solo
  -- es respaldo si la carta cambió entre elegir y confirmar.
  foreach v_nombre in array string_to_array(p_servicios, ' + ') loop
    select coalesce((s.duraciones->>p_barbero)::int, s.dur_min)
      into v_min
      from public.servicios s
     where s.nombre = trim(v_nombre)
     limit 1;
    if v_min is null then v_todo_calza := false; exit; end if;
    v_calculada := v_calculada + v_min;
  end loop;
  v_dur := case when v_todo_calza and v_calculada > 0 then v_calculada else p_dur end;

  if v_dur is null or v_dur < 15 then
    raise exception 'Duración fuera de rango';
  end if;
  if v_dur > 180 then
    raise exception 'Las reservas web van hasta 3 horas — para un combo mayor escríbenos por WhatsApp';
  end if;

  select horario into v_horario from public.negocio limit 1;
  v_apertura := coalesce((v_horario->>'apertura')::int, 12);
  v_fin      := coalesce((v_horario->>'fin')::int, 21);
  if extract(dow from p_fecha) = 2 then
    raise exception 'Los martes el salón está cerrado';
  end if;
  if p_hora < make_time(v_apertura, 0, 0)
     or (p_hora + make_interval(mins => v_dur)) > make_time(v_fin, 0, 0) then
    raise exception 'Hora fuera del horario de atención';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_barbero || '·' || p_fecha::text));

  if exists (
    select 1 from public.turnos t
     where t.fecha = p_fecha
       and t.barbero_nombre = p_barbero
       and t.estado in ('espera','silla','pausado')
       and t.hora < (p_hora + make_interval(mins => v_dur))
       and (t.hora + make_interval(mins => coalesce(t.dur_min, 45))) > p_hora
  ) then
    raise exception 'Ese horario acaba de ocuparse — elige otro';
  end if;

  select coalesce(max(nullif(regexp_replace(t.codigo, '\D', '', 'g'), '')::int), 13) + 1
    into v_num
    from public.turnos t where t.fecha = p_fecha;
  v_codigo := 'A-' || lpad(v_num::text, 3, '0');

  select u.id into v_barbero_id
    from auth.users u
   where u.raw_app_meta_data->>'nombre' = p_barbero
   limit 1;

  insert into public.turnos (codigo, cliente, telefono, servicios, precio_total,
                             dur_min, barbero_id, barbero_nombre, fecha, hora, estado)
  values (v_codigo, trim(p_cliente), p_telefono, trim(p_servicios), p_precio,
          v_dur, v_barbero_id, p_barbero, p_fecha, p_hora, 'espera');

  select count(*) into v_posicion
    from public.turnos t
   where t.fecha = p_fecha and t.barbero_nombre = p_barbero
     and t.estado in ('espera','silla','pausado') and t.hora <= p_hora;

  return query select v_codigo, v_posicion;
end;
$$;

select 'duraciones por persona y tope de 3h aplicados' as resultado;
