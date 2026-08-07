# Parche: `mover` y `correr` del panel pasan a RPCs atómicos

Instrucciones para la sesión que edita `admin/index.html`. Los dos cambios
sustituyen operaciones multi-UPDATE del navegador por las funciones de
`db/11_rpc_cola.sql`, que corren en una sola transacción en Postgres.

**Orden obligatorio:** ejecutar primero `db/11_rpc_cola.sql` en Supabase
(SQL Editor o migración). Si el parche se aplica antes de crear las
funciones, `sb.rpc(...)` devolverá 404 y los botones de la cola quedarán
rotos.

Los toasts visibles no cambian de formato: `mover` sigue mostrando
"Adelantado:/Retrasado: A-xxx" y `correr` sigue mostrando
"Citas corridas +N min (M)" — solo que M ahora es el conteo real que
devuelve el servidor (con RLS, un barbero no-admin puede afectar menos
filas de las que ve).

## Cambio 1 — `mover` (hoy en las líneas 284–292)

`old_string`:

```js
  const mover = async (t, dir) => {
    const esperas = cola.filter(x => x.estado === "espera");
    const i = esperas.findIndex(x => x.id === t.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= esperas.length) return;
    const o = esperas[j];
    await act(t.id, { hora: o.hora, orden: o.orden });
    await act(o.id, { hora: t.hora, orden: t.orden }, dir < 0 ? "Adelantado: " + t.codigo : "Retrasado: " + t.codigo);
  };
```

`new_string`:

```js
  const mover = async (t, dir) => {
    const esperas = cola.filter(x => x.estado === "espera");
    const i = esperas.findIndex(x => x.id === t.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= esperas.length) return;
    const o = esperas[j];
    /* RPC atómico (db/11_rpc_cola.sql): intercambia hora+orden de ambos turnos
       en una sola transacción; si RLS no deja tocar alguno, no cambia nada. */
    const { error } = await sb.rpc("intercambiar_turnos", { a: t.id, b: o.id });
    if (error) { avisar(error.message, true); return; }
    avisar(dir < 0 ? "Adelantado: " + t.codigo : "Retrasado: " + t.codigo);
    cargar(); // el intercambio toca dos filas: un refetch evita depender de dos eventos Realtime
  };
```

Notas:

- El toast de éxito es el mismo que mostraba el segundo `act(...)` original
  (el primero no mostraba ninguno).
- El caso "Sin permiso para ese turno" que antes detectaba `act` con
  `data.length === 0` ahora llega como excepción del RPC
  ("Sin permiso o turno inexistente…") y sale por `avisar(error.message, true)`.
- El RPC no devuelve las filas, así que en vez de `aplicarCambio` por fila se
  hace un `cargar()` (mismo patrón que ya usa `correr`); Realtime igual
  entregará los dos UPDATE, `aplicarCambio` los absorbe sin problema.

## Cambio 2 — `correr` (hoy en las líneas 299–304)

`old_string`:

```js
  const correr = async n => {
    const esperas = cola.filter(x => x.estado === "espera");
    for (const t of esperas) await sb.from("turnos").update({ hora: deMin(aMin(t.hora) + n), hora_original: t.hora_original || t.hora }).eq("id", t.id);
    avisar("Citas corridas +" + n + " min (" + esperas.length + ")");
    cargar(); // cambio masivo: un solo refetch
  };
```

`new_string`:

```js
  const correr = async n => {
    /* RPC atómico (db/11_rpc_cola.sql): un solo UPDATE en el servidor corre
       todos los turnos en espera del día; el wrap de medianoche lo hace
       time+interval nativo, igual que hacía deMin() con su módulo 1440. */
    const { data, error } = await sb.rpc("correr_citas", { dia: hoyISO(), minutos: n });
    if (error) { avisar(error.message, true); return; }
    avisar("Citas corridas +" + n + " min (" + data + ")");
    cargar(); // cambio masivo: un solo refetch
  };
```

Notas:

- `data` es el entero que devuelve `correr_citas` (filas realmente
  afectadas); reemplaza al `esperas.length` optimista del loop.
- El filtro `estado === "espera"` del JS se movió al `WHERE` del RPC
  (`fecha = dia and estado = 'espera'`), así que ya no hace falta filtrar
  `cola` en el cliente.

## Limpieza opcional (tras aplicar el cambio 2)

`aMin` y `deMin` (líneas 164–165) quedaban usados SOLO por `correr`; tras el
parche quedan muertos. Si se quiere, borrar:

```js
const aMin = h => { const [H, M] = hhmm(h).split(":").map(Number); return H * 60 + M; };
const deMin = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
```

(`hhmm` y `hoyISO` sí siguen en uso; no tocarlos.)
