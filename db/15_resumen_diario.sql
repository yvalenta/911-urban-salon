-- Resumen por día para el dashboard del panel (referencia: CRM de barbería).
-- SECURITY INVOKER: la RLS decide — cualquier cuenta del equipo puede leer
-- (turnos ya es select para authenticated); anon no llega (sin grant).
create or replace function public.resumen_diario(desde date, hasta date)
returns table (dia date, atendidos bigint, no_atendidos bigint,
               servicios_cop bigint, productos_cop bigint)
language sql
security invoker
set search_path = ''
stable
as $$
  with dias as (select generate_series(desde, hasta, '1 day')::date as dia),
  t as (
    select fecha, count(*) filter (where estado = 'listo') as atendidos,
           count(*) filter (where estado = 'cancelado') as no_atendidos,
           coalesce(sum(precio_total) filter (where estado = 'listo'), 0) as servicios
    from public.turnos where fecha between desde and hasta group by fecha
  ),
  v as (
    select fecha, coalesce(sum(precio * cantidad), 0) as productos
    from public.ventas where fecha between desde and hasta group by fecha
  )
  select d.dia, coalesce(t.atendidos, 0), coalesce(t.no_atendidos, 0),
         coalesce(t.servicios, 0), coalesce(v.productos, 0)
  from dias d
  left join t on t.fecha = d.dia
  left join v on v.fecha = d.dia
  order by d.dia;
$$;
revoke all on function public.resumen_diario(date, date) from public, anon;
grant execute on function public.resumen_diario(date, date) to authenticated;
select 'resumen diario listo' as resultado;
