-- Limpieza de datos de prueba en producción.
--
-- Convención (ver docs/pruebas-en-produccion.md): todo dato de prueba lleva
-- el prefijo "PRUEBA " en su campo de nombre — turnos.cliente y
-- ventas.vendedor. Solo hay una base, así que las pruebas del panel
-- conviven con las filas reales del negocio; este script las saca sin
-- tocar nada más.
--
-- Antes de borrar: descomentar y correr este select para ver qué se iría.
--
-- select 'turno' as tipo, t.id, t.fecha::text as fecha, t.codigo as detalle,
--        t.cliente as quien
--   from public.turnos t
--  where t.cliente like 'PRUEBA %'
-- union all
-- select 'venta', v.id, v.fecha::text, v.nombre,
--        coalesce(v.vendedor, '(venta de un turno de prueba)')
--   from public.ventas v
--  where v.vendedor like 'PRUEBA %'
--     or v.turno_id in (select id from public.turnos
--                        where cliente like 'PRUEBA %');

begin;

-- Las ventas van primero: las ancladas por turno_id a un turno de prueba
-- quedarían huérfanas (o bloquearían el borrado, si la FK es restrictiva)
-- si los turnos se fueran antes. Una venta cuenta como prueba por su
-- vendedor "PRUEBA ..." o por colgar de un turno de prueba, aunque el
-- vendedor no lleve prefijo.
delete from public.ventas
 where vendedor like 'PRUEBA %'
    or turno_id in (select id from public.turnos
                     where cliente like 'PRUEBA %');

delete from public.turnos
 where cliente like 'PRUEBA %';

commit;
