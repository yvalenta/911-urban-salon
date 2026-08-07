# Pruebas en producción sin ensuciar la caja

Solo hay una base: el proyecto de Supabase que sirve a la landing y al panel.
Toda prueba del panel —crear un turno, confirmarlo, vender productos—
escribe en las mismas tablas que el negocio real.

## Por qué no probar con datos reales

El Resumen del día suma los `precio_total` de los turnos atendidos y las
ventas de productos de hoy. Un turno de prueba "confirmado" con un monto
infla la caja y el conteo de atendidos: el cierre deja de cuadrar con la
plata física, y esa confianza es todo el valor del resumen.

## La convención: prefijo `PRUEBA `

Todo dato de prueba lleva el prefijo `PRUEBA ` (en mayúsculas, con espacio)
en su campo de nombre:

- turnos: `cliente = "PRUEBA Andrés"`
- ventas: `vendedor = "PRUEBA Caja"` — y toda venta anclada por `turno_id`
  a un turno de prueba cuenta como prueba, lleve o no el prefijo.

Así las pruebas se distinguen a simple vista en el panel y se borran por
consulta, sin adivinar qué filas eran del negocio.

## Cómo limpiar

En el SQL editor de Supabase, abrir `ops/limpiar_pruebas.sql`: correr
primero el `select` comentado para ver qué se iría, y después el bloque de
`delete` (ventas antes que turnos, porque cuelgan por `turno_id`).

## Decisión pendiente: staging de verdad

Un segundo proyecto de Supabase (gratis) como staging separaría pruebas de
producción por completo. Costo: duplicar migraciones y seeds, mantener dos
URLs sincronizadas, y el plan gratuito pausa proyectos inactivos justo
cuando se los necesita. Beneficio: cero riesgo de ensuciar la caja y
libertad para probar migraciones destructivas. Mientras las pruebas sean
ocasionales, el prefijo alcanza; si se vuelven semanales, crear el staging.
