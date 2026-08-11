
/* ══ 911 Urban Salón — Panel de turnos en vivo (Supabase + roles) ══ */
const SB_URL = "https://ssrrkcshhrggukknkoua.supabase.co";
const SB_KEY = "sb_publishable_zLevCihGrnQqqlgM7mXbrw_HyBtvzIj"; // llave pública (RLS protege los datos)
const sb = window.supabase.createClient(SB_URL, SB_KEY);

const hoyISO = () => new Date().toLocaleDateString("en-CA");
const hhmm = h => (h || "").slice(0, 5);
const fmtCOP = n => "$" + (n || 0).toLocaleString("es-CO");
const transcurrido = t => {
  if (!t.iniciado_en) return null;
  const fin = t.estado === "pausado" && t.pausado_en ? new Date(t.pausado_en).getTime() : Date.now();
  return Math.max(0, Math.floor(((fin - new Date(t.iniciado_en).getTime()) / 1000 - (t.pausa_acum_seg || 0)) / 60));
};

function Ic({ d, s = 16 }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const I = {
  play: "M6 4l14 8-14 8z", pausa: "M9 5v14M15 5v14", check: "M4 12l5 5 11-11", atras: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  arriba: "M12 19V5M5 12l7-7 7 7", abajo: "M12 5v14M19 12l-7 7-7-7", reloj: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0",
  basura: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", mas: "M12 5v14M5 12h14", puntos: "M12 6h.01M12 12h.01M12 18h.01",
  rayo: "M13 2L4 14h6l-1 8 9-12h-6l1-8", salir: "M10 17l5-5-5-5M15 12H3M19 3h1a1 1 0 011 1v16a1 1 0 01-1 1h-1",
  usuario: "M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8", cola: "M4 6h16M4 12h10M4 18h7",
  tv: "M3 5h18v12H3zM8 21h8", noAtendio: "M15 9l-6 6M9 9l6 6M21 12a9 9 0 11-18 0 9 9 0 0118 0",
  lapiz: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z", foto: "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8",
  caja: "M3 9l2-5h14l2 5M3 9h18v11H3zM10 13h4", carrito: "M6 6h15l-1.5 8H8L6 6zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z", ajustes: "M12 15a3 3 0 100-6 3 3 0 000 6M19 12a7 7 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a7 7 0 01-2 1.2L14 21h-4l-.4-2.6a7 7 0 01-2-1.2l-2.4 1-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.1-1.2l-2-1.6 2-3.4 2.4 1a7 7 0 012-1.2L10 3h4l.4 2.6a7 7 0 012 1.2l2.4-1 2 3.4-2 1.6c.1.4.2.8.2 1.2z"
};

/* ── Toasts ── */
function useToasts() {
  const [lista, setLista] = React.useState([]);
  const avisar = (msj, err) => {
    const id = Date.now() + Math.random();
    setLista(l => [...l, { id, msj, err }]);
    setTimeout(() => setLista(l => l.filter(t => t.id !== id)), 3800);
  };
  const ui = (
    <div className="toasts">
      {lista.map(t => <div key={t.id} className={"toast" + (t.err ? " err" : "")}>{t.msj}</div>)}
    </div>
  );
  return [avisar, ui];
}

/* ── Datos en vivo ── */
function useTurnos(avisar) {
  const [cola, setCola] = React.useState([]);
  const [vivo, setVivo] = React.useState(false);
  const [, setTick] = React.useState(0);

  const cargar = React.useCallback(async () => {
    const { data, error } = await sb.from("turnos").select("*").eq("fecha", hoyISO()).order("hora").order("orden");
    if (error) avisar("No pude cargar la cola: " + error.message, true);
    else setCola(data || []);
  }, []);

  /* Cada evento de Realtime se aplica sobre la lista en memoria (sin refetch
     del día completo: con volumen alto y varios dispositivos eso multiplica
     consultas). El refetch queda solo para reconexión y resync de respaldo. */
  const ordenCola = (a, b) => a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : (a.orden || 0) - (b.orden || 0);
  const aplicarCambio = React.useCallback(payload => {
    setCola(prev => {
      if (payload.eventType === "DELETE") return prev.filter(t => t.id !== payload.old.id);
      const fila = payload.new;
      if (!fila || !fila.id) return prev;
      const sin = prev.filter(t => t.id !== fila.id);
      if (fila.fecha !== hoyISO()) return sin; // reagendado a otro día
      return [...sin, fila].sort(ordenCola);
    });
  }, []);

  React.useEffect(() => {
    cargar(); // carga inicial aunque Realtime no logre conectar
    const canal = sb.channel("turnos-vivo")
      .on("postgres_changes", { event: "*", schema: "public", table: "turnos" }, aplicarCambio)
      .subscribe(st => {
        setVivo(st === "SUBSCRIBED");
        if (st === "SUBSCRIBED") cargar(); // recuperación de eventos perdidos al reconectar
      });
    /* El websocket se duerme con la pantalla bloqueada: al volver la app al
       frente o recuperar red, refetch inmediato. */
    const despertar = () => { if (!document.hidden) cargar(); };
    document.addEventListener("visibilitychange", despertar);
    window.addEventListener("online", despertar);
    const iv = setInterval(() => setTick(t => t + 1), 20000);
    const resync = setInterval(cargar, 120000); // respaldo por si Realtime pierde un evento en silencio
    return () => {
      sb.removeChannel(canal); clearInterval(iv); clearInterval(resync);
      document.removeEventListener("visibilitychange", despertar);
      window.removeEventListener("online", despertar);
    };
  }, [cargar, aplicarCambio]);

  const act = async (id, campos, ok) => {
    const { data, error } = await sb.from("turnos").update(campos).eq("id", id).select();
    if (error) avisar(error.message, true);
    else if (!data.length) avisar("Sin permiso para ese turno", true);
    else { if (ok) avisar(ok); aplicarCambio({ eventType: "UPDATE", new: data[0] }); }
  };

  const llamar = async t => {
    const abierto = cola.find(x => x.barbero_nombre === t.barbero_nombre && (x.estado === "silla" || x.estado === "pausado") && x.id !== t.id);
    if (abierto) { avisar("Confirma o pausa el turno " + abierto.codigo + " antes de llamar otro", true); return; }
    await act(t.id, { estado: "silla", iniciado_en: new Date().toISOString(), pausado_en: null, pausa_acum_seg: 0 }, "En silla: " + t.codigo);
  };
  /* Confirmación de atención: cierra el turno con su monto y registra productos vendidos. */
  const confirmar = async (t, monto, items, user, vendedor) => {
    await act(t.id, { estado: "listo", precio_total: monto === "" ? t.precio_total : (parseInt(monto, 10) || 0) }, "Atención confirmada: " + t.codigo);
    if (items.length) {
      const filas = items.map(i => ({ producto_id: i.producto_id, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad, turno_id: t.id, vendido_por: user, vendedor, fecha: hoyISO() }));
      const { error } = await sb.from("ventas").insert(filas);
      if (error) avisar(error.message, true); else avisar("Productos registrados: " + items.reduce((a, i) => a + i.cantidad, 0));
    }
  };
  /* No atendido: saca el turno de la fila con motivo opcional. Reversible. */
  const noAtendido = (t, motivo) => act(t.id, { estado: "cancelado", motivo_no_atencion: motivo || null, iniciado_en: null, pausado_en: null, pausa_acum_seg: 0 }, "No atendido: " + t.codigo);
  const terminar = t => act(t.id, { estado: "listo" }, "Atendido: " + t.codigo);
  const pausar = t => act(t.id, { estado: "pausado", pausado_en: new Date().toISOString() }, "Pausado: " + t.codigo);
  const reanudar = t => act(t.id, {
    estado: "silla", pausado_en: null,
    pausa_acum_seg: (t.pausa_acum_seg || 0) + Math.max(0, Math.floor((Date.now() - new Date(t.pausado_en || Date.now()).getTime()) / 1000))
  }, "Reanudado: " + t.codigo);
  const atras = t => t.estado === "listo"
    ? act(t.id, { estado: "silla", iniciado_en: t.iniciado_en || new Date().toISOString() }, "Confirmación devuelta: " + t.codigo + " vuelve a silla")
    : act(t.id, { estado: "espera", iniciado_en: null, pausado_en: null, pausa_acum_seg: 0, motivo_no_atencion: null }, "De vuelta en espera: " + t.codigo);
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
  const reagendar = (t, hora) => act(t.id, { hora, hora_original: t.hora_original || t.hora }, t.codigo + " reagendado a " + hhmm(hora));
  const eliminar = async t => {
    const { error } = await sb.from("turnos").delete().eq("id", t.id);
    if (error) avisar(error.message, true);
    else { avisar("Eliminado: " + t.codigo); aplicarCambio({ eventType: "DELETE", old: { id: t.id } }); }
  };
  const correr = async n => {
    /* RPC atómico (db/11_rpc_cola.sql): un solo UPDATE en el servidor corre
       todos los turnos en espera del día; el wrap de medianoche lo hace
       time+interval nativo, igual que hacía deMin() con su módulo 1440. */
    const { data, error } = await sb.rpc("correr_citas", { dia: hoyISO(), minutos: n });
    if (error) { avisar(error.message, true); return; }
    avisar("Citas corridas +" + n + " min (" + data + ")");
    cargar(); // cambio masivo: un solo refetch
  };
  const crear = async campos => {
    const nums = cola.map(t => parseInt((t.codigo || "").replace(/\D/g, ""), 10) || 0);
    const codigo = "A-" + String(Math.max(13, ...nums) + 1).padStart(3, "0");
    const { data, error } = await sb.from("turnos").insert({ ...campos, codigo, fecha: hoyISO() }).select();
    if (error) avisar(error.message, true);
    else { avisar("Turno creado: " + codigo); if (data && data[0]) aplicarCambio({ eventType: "INSERT", new: data[0] }); }
  };
  const siguiente = async barbero => {
    const prox = cola.find(t => t.estado === "espera" && (!barbero || t.barbero_nombre === barbero));
    if (prox) llamar(prox); else avisar("No hay turnos en espera", true);
  };

  return { cola, vivo, llamar, terminar, confirmar, noAtendido, pausar, reanudar, atras, mover, reagendar, eliminar, correr, crear, siguiente };
}

/* ── Catálogo de productos (administrable) ── */
function useProductos(avisar) {
  const [productos, setProductos] = React.useState([]);
  const cargar = React.useCallback(async () => {
    const { data, error } = await sb.from("productos").select("*").order("nombre");
    if (!error) setProductos(data || []);
  }, []);
  React.useEffect(() => {
    cargar();
    const c = sb.channel("productos-vivo").on("postgres_changes", { event: "*", schema: "public", table: "productos" }, cargar)
      .subscribe(st => { if (st === "SUBSCRIBED") cargar(); });
    return () => sb.removeChannel(c);
  }, [cargar]);
  const guardar = async (id, campos, ok) => {
    const q = id ? sb.from("productos").update(campos).eq("id", id) : sb.from("productos").insert(campos);
    const { error } = await q;
    if (error) avisar(error.message, true); else avisar(ok);
    cargar();
  };
  const eliminar = async pr => {
    const { error } = await sb.from("productos").delete().eq("id", pr.id);
    if (error) avisar(error.message, true); else avisar("Producto eliminado: " + pr.nombre);
    cargar();
  };
  return { productos, activos: productos.filter(p => p.activo), guardar, eliminar };
}

/* ── Ventas del día ── */
function useVentas(avisar) {
  const [ventas, setVentas] = React.useState([]);
  const cargar = React.useCallback(async () => {
    const { data, error } = await sb.from("ventas").select("*").eq("fecha", hoyISO()).order("creado_en", { ascending: false });
    if (!error) setVentas(data || []);
  }, []);
  React.useEffect(() => {
    cargar();
    const c = sb.channel("ventas-vivo").on("postgres_changes", { event: "*", schema: "public", table: "ventas" }, cargar)
      .subscribe(st => { if (st === "SUBSCRIBED") cargar(); });
    return () => sb.removeChannel(c);
  }, [cargar]);
  const vender = async (items, user, vendedor, turno_id) => {
    const filas = items.map(i => ({ producto_id: i.producto_id, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad, turno_id: turno_id || null, vendido_por: user, vendedor, fecha: hoyISO() }));
    const { error } = await sb.from("ventas").insert(filas);
    if (error) avisar(error.message, true); else avisar("Venta registrada");
    cargar();
  };
  const anular = async v => {
    const { error } = await sb.from("ventas").delete().eq("id", v.id);
    if (error) avisar(error.message, true); else avisar("Venta anulada: " + v.nombre);
    cargar();
  };
  return { ventas, vender, anular };
}

/* ── Contenido del sitio público (negocio + carta) — fase 2 ──
   Lo que se guarda aquí lo lee la landing con la anon key: editar = publicar. */
function useContenido(avisar) {
  const [negocio, setNegocio] = React.useState(null);
  const [servicios, setServicios] = React.useState([]);
  const cargar = React.useCallback(async () => {
    const [n, s] = await Promise.all([
      sb.from("negocio").select("*").limit(1),
      sb.from("servicios").select("*").order("orden").order("creado_en")
    ]);
    if (!n.error) setNegocio((n.data || [])[0] || null);
    if (!s.error) setServicios(s.data || []);
  }, []);
  React.useEffect(() => {
    const c = sb.channel("contenido-vivo")
      .on("postgres_changes", { event: "*", schema: "public", table: "negocio" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "servicios" }, cargar)
      .subscribe(st => { if (st === "SUBSCRIBED") cargar(); });
    return () => sb.removeChannel(c);
  }, [cargar]);
  const guardarNegocio = async (campos, ok) => {
    const { error } = await sb.from("negocio").update({ ...campos, actualizado_en: new Date().toISOString() }).eq("id", negocio.id);
    if (error) avisar(error.message, true); else avisar(ok || "Guardado — publicado en la página");
    cargar();
  };
  const guardarServicio = async (id, campos, ok) => {
    const q = id ? sb.from("servicios").update(campos).eq("id", id) : sb.from("servicios").insert(campos);
    const { error } = await q;
    if (error) avisar(error.message, true); else avisar(ok || "Servicio guardado");
    cargar();
  };
  const eliminarServicio = async s => {
    const { error } = await sb.from("servicios").delete().eq("id", s.id);
    if (error) avisar(error.message, true); else avisar("Eliminado de la carta: " + s.nombre);
    cargar();
  };
  const subirFoto = async (srv, file) => {
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) { avisar("La foto debe pesar menos de 2.5 MB", true); return; }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ruta = "servicios/" + srv.id + "." + ext;
    const { error } = await sb.storage.from("publico").upload(ruta, file, { upsert: true, cacheControl: "3600", contentType: file.type || "image/jpeg" });
    if (error) { avisar(error.message, true); return; }
    const { data } = sb.storage.from("publico").getPublicUrl(ruta);
    await guardarServicio(srv.id, { img: data.publicUrl + "?v=" + Date.now() }, "Foto publicada: " + srv.nombre);
  };
  /* Imágenes de marca (banner, logo del pie): suben a Storage y su URL queda
     en negocio.imagenes — la landing la usa apenas se recarga. */
  const subirImagenMarca = async (clave, file) => {
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) { avisar("La imagen debe pesar menos de 2.5 MB", true); return; }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ruta = "marca/" + clave + "." + ext;
    const { error } = await sb.storage.from("publico").upload(ruta, file, { upsert: true, cacheControl: "3600", contentType: file.type || "image/jpeg" });
    if (error) { avisar(error.message, true); return; }
    const { data } = sb.storage.from("publico").getPublicUrl(ruta);
    await guardarNegocio({ imagenes: { ...(negocio.imagenes || {}), [clave]: data.publicUrl + "?v=" + Date.now() } }, "Imagen publicada");
  };
  const quitarImagenMarca = async clave => {
    const imgs = { ...(negocio.imagenes || {}) };
    delete imgs[clave];
    await guardarNegocio({ imagenes: imgs }, "Vuelve la imagen original");
  };
  return { negocio, servicios, guardarNegocio, guardarServicio, eliminarServicio, subirFoto, subirImagenMarca, quitarImagenMarca };
}

/* ── Piezas ── */
function EstadoTurno({ t }) {
  const min = transcurrido(t);
  if (t.estado === "espera") return <span className="badge">En espera</span>;
  if (t.estado === "silla") return <span className="badge brand vivo"><span className="pt" />En silla · {min} min</span>;
  if (t.estado === "pausado") return <span className="badge warn"><Ic d={I.pausa} s={11} />Pausado · {min} min</span>;
  if (t.estado === "cancelado") return <span className="badge bad">No atendido</span>;
  return <span className="badge ok"><Ic d={I.check} s={11} />Atendido</span>;
}
function HoraTurno({ t }) {
  const corrida = t.hora_original && hhmm(t.hora_original) !== hhmm(t.hora);
  return <span style={{ font: "600 13.5px var(--mono)", color: "var(--tx)" }}>
    {corrida && <s style={{ color: "var(--tx-3)", marginRight: 6 }}>{hhmm(t.hora_original)}</s>}{hhmm(t.hora)}
  </span>;
}

function MenuFila({ t, admin, ops, abierto, setAbierto }) {
  const cerrar = fn => (...a) => { setAbierto(null); fn(...a); };
  return (
    <div className="menu-wrap">
      <button className="icon-btn" aria-label="Más acciones" onClick={() => setAbierto(abierto === t.id ? null : t.id)}><Ic d={I.puntos} /></button>
      {abierto === t.id && (
        <div className="menu" onMouseLeave={() => setAbierto(null)}>
          {t.estado === "espera" && admin && <button onClick={cerrar(() => ops.mover(t, -1))}><Ic d={I.arriba} s={14} />Adelantar en la fila</button>}
          {t.estado === "espera" && admin && <button onClick={cerrar(() => ops.mover(t, 1))}><Ic d={I.abajo} s={14} />Retrasar en la fila</button>}
          {t.estado === "espera" && admin && <button onClick={cerrar(() => ops.abrirReagendar(t))}><Ic d={I.reloj} s={14} />Reagendar hora…</button>}
          {t.estado === "silla" && <button onClick={cerrar(() => ops.pausar(t))}><Ic d={I.pausa} s={14} />Pausar turno</button>}
          {t.estado === "pausado" && <button onClick={cerrar(() => ops.reanudar(t))}><Ic d={I.play} s={14} />Reanudar</button>}
          {t.estado !== "espera" && <button onClick={cerrar(() => ops.atras(t))}><Ic d={I.atras} s={14} />{t.estado === "listo" ? "Devolver confirmación" : "Volver a espera"}</button>}
          {["espera", "silla", "pausado"].includes(t.estado) && <button onClick={cerrar(() => ops.abrirNoAtendido(t))}><Ic d={I.noAtendio} s={14} />No atendido…</button>}
          {admin && <div className="sep" />}
          {admin && <button className="rojo" onClick={cerrar(() => ops.abrirEliminar(t))}><Ic d={I.basura} s={14} />Eliminar turno</button>}
        </div>
      )}
    </div>
  );
}

/* En el celular la cola no es una tabla: es una tarjeta por turno, con lo
   importante primero (código+hora+estado, cliente, servicios) y la acción
   principal al ancho del pulgar. La tabla se corta con scroll horizontal y
   esconde justo las columnas de acción. */
function useMovilPanel() {
  const [m, setM] = React.useState(() => window.matchMedia("(max-width: 560px)").matches);
  React.useEffect(() => {
    const q = window.matchMedia("(max-width: 560px)");
    const f = e => setM(e.matches);
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return m;
}

function TarjetaTurno({ t, T, ops, menu, setMenu, onConfirmar }) {
  return (
    <div className={"turno-card" + (t.estado === "listo" || t.estado === "cancelado" ? " dim" : "")}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span className="cod">{t.codigo}</span>
        <HoraTurno t={t} />
        <span style={{ marginLeft: "auto" }}><EstadoTurno t={t} /></span>
      </div>
      <div style={{ color: "var(--tx)", fontWeight: 700, fontSize: 16 }}>{t.cliente}</div>
      <div className="tenue" style={{ fontSize: 13 }}>{t.servicios} · {t.barbero_nombre}</div>
      {t.estado === "cancelado" && t.motivo_no_atencion && <div style={{ color: "#FF8A8E", fontSize: 12 }}>Motivo: {t.motivo_no_atencion}</div>}
      {["espera", "silla", "pausado"].includes(t.estado) || t.estado === "listo" ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {t.estado === "espera" && <button className="btn outline" style={{ flex: 1 }} onClick={() => T.llamar(t)}><Ic d={I.play} s={13} />Llamar</button>}
          {t.estado === "silla" && <button className="btn ok" style={{ flex: 1 }} onClick={() => onConfirmar(t)}><Ic d={I.check} s={13} />Terminar</button>}
          {t.estado === "pausado" && <button className="btn outline" style={{ flex: 1 }} onClick={() => T.reanudar(t)}><Ic d={I.play} s={13} />Reanudar</button>}
          {t.estado === "listo" && <span style={{ flex: 1 }} />}
          <MenuFila t={t} admin ops={ops} abierto={menu} setAbierto={setMenu} />
        </div>
      ) : null}
    </div>
  );
}

/* ── Vista: cola (admin) ── */
function VistaCola({ T, P, user, nombreUser }) {
  const movil = useMovilPanel();
  const [menu, setMenu] = React.useState(null);
  const [reag, setReag] = React.useState(null);
  const [borra, setBorra] = React.useState(null);
  const [nuevo, setNuevo] = React.useState(false);
  const [confirma, setConfirma] = React.useState(null);
  const [noAt, setNoAt] = React.useState(null);
  const espera = T.cola.filter(t => t.estado === "espera").length;
  const enSilla = T.cola.filter(t => t.estado === "silla" || t.estado === "pausado").length;
  const listos = T.cola.filter(t => t.estado === "listo").length;
  const noAtendidos = T.cola.filter(t => t.estado === "cancelado").length;
  const ops = { ...T, abrirReagendar: setReag, abrirEliminar: setBorra, abrirNoAtendido: setNoAt };

  return (
    <React.Fragment>
      <div className="stats">
        <div className="stat"><span className="eyebrow">En espera</span><b>{espera}</b></div>
        <div className="stat naranja"><span className="eyebrow">En silla</span><b>{enSilla}</b></div>
        <div className="stat"><span className="eyebrow">Atendidos hoy</span><b>{listos}</b></div>
        <div className="stat"><span className="eyebrow">No atendidos</span><b>{noAtendidos}</b></div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn primary" onClick={() => T.siguiente(null)}><Ic d={I.rayo} s={14} />Siguiente turno</button>
        <button className="btn outline" onClick={() => setNuevo(true)}><Ic d={I.mas} s={14} />Nuevo turno</button>
        <span style={{ marginLeft: "auto" }} className="eyebrow">¿Se alargó? Correr citas</span>
        {[10, 15, 30].map(n => <button key={n} className="btn outline sm" onClick={() => T.correr(n)}>+{n} min</button>)}
      </div>

      {movil ? (
        <div style={{ display: "grid", gap: 10 }}>
          {T.cola.map(t => <TarjetaTurno key={t.id} t={t} T={T} ops={ops} menu={menu} setMenu={setMenu} onConfirmar={setConfirma} />)}
          {!T.cola.length && <div className="turno-card tenue" style={{ textAlign: "center", padding: 24 }}>Sin turnos hoy. Crea el primero con "Nuevo turno".</div>}
        </div>
      ) : (
      <div className="tabla-wrap">
        <table className="tabla">
          <thead><tr><th>Código</th><th>Cliente</th><th>Servicios</th><th>Barbero</th><th>Hora</th><th>Estado</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
          <tbody>
            {T.cola.map(t => (
              <tr key={t.id} className={t.estado === "listo" || t.estado === "cancelado" ? "dim" : ""}>
                <td><span className="cod">{t.codigo}</span></td>
                <td style={{ color: "var(--tx)", fontWeight: 600 }}>{t.cliente}</td>
                <td className="tenue" style={{ maxWidth: 220 }}>{t.servicios}{t.estado === "cancelado" && t.motivo_no_atencion && <div style={{ color: "#FF8A8E", fontSize: 12 }}>Motivo: {t.motivo_no_atencion}</div>}</td>
                <td className="tenue">{t.barbero_nombre}</td>
                <td><HoraTurno t={t} /></td>
                <td><EstadoTurno t={t} /></td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    {t.estado === "espera" && <button className="btn outline sm" onClick={() => T.llamar(t)}><Ic d={I.play} s={12} />Llamar</button>}
                    {t.estado === "silla" && <button className="btn ok sm" onClick={() => setConfirma(t)}><Ic d={I.check} s={12} />Terminar</button>}
                    {t.estado === "pausado" && <button className="btn outline sm" onClick={() => T.reanudar(t)}><Ic d={I.play} s={12} />Reanudar</button>}
                    <MenuFila t={t} admin ops={ops} abierto={menu} setAbierto={setMenu} />
                  </div>
                </td>
              </tr>
            ))}
            {!T.cola.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: 30 }} className="tenue">Sin turnos hoy. Crea el primero con "Nuevo turno".</td></tr>}
          </tbody>
        </table>
      </div>
      )}

      {reag && <DialogoReagendar t={reag} onOk={h => { T.reagendar(reag, h); setReag(null); }} onNo={() => setReag(null)} />}
      {borra && (
        <div className="velo" onClick={() => setBorra(null)}>
          <div className="dialogo" onClick={e => e.stopPropagation()}>
            <h3>Eliminar turno</h3>
            <p style={{ margin: 0 }}>Se elimina <b style={{ color: "var(--tx)" }}>{borra.codigo} · {borra.cliente}</b> de la cola de hoy. Esta acción no se puede deshacer.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setBorra(null)}>Cancelar</button>
              <button className="btn danger" onClick={() => { T.eliminar(borra); setBorra(null); }}><Ic d={I.basura} s={14} />Eliminar</button>
            </div>
          </div>
        </div>
      )}
      {nuevo && <DialogoNuevo T={T} onCerrar={() => setNuevo(false)} />}
      {confirma && <DialogoConfirmar t={confirma} productos={P.activos} onOk={(m, items) => { T.confirmar(confirma, m, items, user, nombreUser); setConfirma(null); }} onNo={() => setConfirma(null)} />}
      {noAt && <DialogoNoAtendido t={noAt} onOk={m => { T.noAtendido(noAt, m); setNoAt(null); }} onNo={() => setNoAt(null)} />}
    </React.Fragment>
  );
}

/* ── Diálogo: confirmar atención (monto + productos vendidos) ── */
function DialogoConfirmar({ t, productos, onOk, onNo }) {
  const [monto, setMonto] = React.useState(t.precio_total != null ? String(t.precio_total) : "");
  const [items, setItems] = React.useState([]);
  const [sel, setSel] = React.useState(productos[0] ? productos[0].id : "");
  /* Descuentos rápidos estilo POS: chips que parten del precio del servicio.
     "Completo" vuelve al valor original; el monto sigue editable a mano. */
  const base = t.precio_total || 0;
  const [desc, setDesc] = React.useState(0);
  const aplicarDesc = pct => { setDesc(pct); setMonto(String(Math.round(base * (1 - pct / 100) / 500) * 500)); };
  const agregar = () => {
    const pr = productos.find(p => p.id === sel);
    if (!pr) return;
    setItems(li => {
      const ya = li.find(i => i.producto_id === pr.id);
      return ya ? li.map(i => i.producto_id === pr.id ? { ...i, cantidad: i.cantidad + 1 } : i)
                : [...li, { producto_id: pr.id, nombre: pr.nombre, precio: pr.precio, cantidad: 1 }];
    });
  };
  const quitar = id => setItems(li => li.filter(i => i.producto_id !== id));
  const totalProd = items.reduce((a, i) => a + i.precio * i.cantidad, 0);
  const total = (parseInt(monto, 10) || 0) + totalProd;
  return (
    <div className="velo" onClick={onNo}>
      <div className="dialogo" onClick={e => e.stopPropagation()}>
        <h3>Confirmar atención · {t.codigo}</h3>
        <p style={{ margin: 0 }} className="tenue">{t.cliente} · {t.servicios}. Si confirmas por error, puedes devolverlo desde el menú del turno.</p>
        <label className="fld"><span>Valor de los servicios (COP)</span>
          <input className="input" type="number" min="0" step="1000" value={monto} onChange={e => { setMonto(e.target.value); setDesc(-1); }} placeholder="50000" />
        </label>
        {base > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[[0, "Completo"], [10, "−10%"], [20, "−20%"], [50, "−50%"]].map(([pct, etq]) => (
              <button key={pct} type="button" className={"btn sm " + (desc === pct ? "primary" : "outline")} onClick={() => aplicarDesc(pct)}>{etq}</button>
            ))}
          </div>
        )}
        {productos.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Productos vendidos (opcional)</span>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="input" value={sel} onChange={e => setSel(e.target.value)} style={{ flex: 1 }}>
                {productos.map(pr => <option key={pr.id} value={pr.id}>{pr.nombre} · {fmtCOP(pr.precio)}</option>)}
              </select>
              <button type="button" className="btn outline" onClick={agregar}><Ic d={I.mas} s={14} />Agregar</button>
            </div>
            {items.map(i => (
              <div key={i.producto_id} style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" }}>
                <span style={{ flex: 1, color: "var(--tx)" }}>{i.nombre} × {i.cantidad}</span>
                <span className="tenue">{fmtCOP(i.precio * i.cantidad)}</span>
                <button className="icon-btn" onClick={() => quitar(i.producto_id)} aria-label={"Quitar " + i.nombre}><Ic d={I.basura} s={13} /></button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <span className="eyebrow">Total</span>
          <b style={{ font: "400 26px/1 var(--disp)", color: "var(--brand)" }}>{fmtCOP(total)}</b>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onNo}>Cancelar</button>
          <button className="btn primary" onClick={() => onOk(monto, items)}><Ic d={I.check} s={14} />Confirmar atención</button>
        </div>
      </div>
    </div>
  );
}

/* ── Diálogo: no atendido (motivo opcional) ── */
function DialogoNoAtendido({ t, onOk, onNo }) {
  const [motivo, setMotivo] = React.useState("");
  const rapidos = ["No llegó", "Se fue por la espera", "Reprogramó", "Error al crearlo"];
  return (
    <div className="velo" onClick={onNo}>
      <div className="dialogo" onClick={e => e.stopPropagation()}>
        <h3>No atendido · {t.codigo}</h3>
        <p style={{ margin: 0 }} className="tenue">{t.cliente} sale de la fila. El motivo es opcional y queda en el resumen del día. Reversible desde el menú.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {rapidos.map(r => <button key={r} className={"btn sm " + (motivo === r ? "primary" : "outline")} onClick={() => setMotivo(motivo === r ? "" : r)}>{r}</button>)}
        </div>
        <label className="fld"><span>Motivo (opcional)</span>
          <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Escribe o elige uno" />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onNo}>Cancelar</button>
          <button className="btn danger" onClick={() => onOk(motivo.trim())}><Ic d={I.noAtendio} s={14} />Marcar no atendido</button>
        </div>
      </div>
    </div>
  );
}

/* ── Diálogo: venta suelta de productos ── */
function DialogoVenta({ productos, onOk, onNo }) {
  const [items, setItems] = React.useState([]);
  const [sel, setSel] = React.useState(productos[0] ? productos[0].id : "");
  const agregar = () => {
    const pr = productos.find(p => p.id === sel);
    if (!pr) return;
    setItems(li => {
      const ya = li.find(i => i.producto_id === pr.id);
      return ya ? li.map(i => i.producto_id === pr.id ? { ...i, cantidad: i.cantidad + 1 } : i)
                : [...li, { producto_id: pr.id, nombre: pr.nombre, precio: pr.precio, cantidad: 1 }];
    });
  };
  const total = items.reduce((a, i) => a + i.precio * i.cantidad, 0);
  return (
    <div className="velo" onClick={onNo}>
      <div className="dialogo" onClick={e => e.stopPropagation()}>
        <h3>Vender productos</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="input" value={sel} onChange={e => setSel(e.target.value)} style={{ flex: 1 }}>
            {productos.map(pr => <option key={pr.id} value={pr.id}>{pr.nombre} · {fmtCOP(pr.precio)}</option>)}
          </select>
          <button type="button" className="btn outline" onClick={agregar}><Ic d={I.mas} s={14} />Agregar</button>
        </div>
        {items.map(i => (
          <div key={i.producto_id} style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" }}>
            <span style={{ flex: 1, color: "var(--tx)" }}>{i.nombre} × {i.cantidad}</span>
            <span className="tenue">{fmtCOP(i.precio * i.cantidad)}</span>
            <button className="icon-btn" onClick={() => setItems(li => li.filter(x => x.producto_id !== i.producto_id))}><Ic d={I.basura} s={13} /></button>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <span className="eyebrow">Total</span>
          <b style={{ font: "400 24px/1 var(--disp)", color: "var(--brand)" }}>{fmtCOP(total)}</b>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onNo}>Cancelar</button>
          <button className="btn primary" disabled={!items.length} onClick={() => onOk(items)}><Ic d={I.carrito} s={14} />Registrar venta</button>
        </div>
      </div>
    </div>
  );
}

function DialogoReagendar({ t, onOk, onNo }) {
  const [hora, setHora] = React.useState(hhmm(t.hora));
  return (
    <div className="velo" onClick={onNo}>
      <div className="dialogo" onClick={e => e.stopPropagation()}>
        <h3>Reagendar {t.codigo}</h3>
        <label className="fld"><span>Nueva hora</span>
          <input className="input" type="time" value={hora} onChange={e => setHora(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onNo}>Cancelar</button>
          <button className="btn primary" disabled={!/^\d\d:\d\d$/.test(hora)} onClick={() => onOk(hora)}><Ic d={I.check} s={14} />Guardar</button>
        </div>
      </div>
    </div>
  );
}

function DialogoNuevo({ T, onCerrar }) {
  const barberos = React.useMemo(() => {
    const m = new Map();
    T.cola.forEach(t => { if (!m.has(t.barbero_nombre)) m.set(t.barbero_nombre, t.barbero_id); });
    ["Samuel", "Mateo", "Julián", "Masajista por confirmar"].forEach(n => { if (!m.has(n)) m.set(n, null); });
    return [...m.entries()];
  }, [T.cola]);
  const [f, setF] = React.useState({ cliente: "", servicios: "", barbero: barberos[0][0], hora: "" });
  const listo = f.cliente.trim().length > 1 && f.servicios.trim() && /^\d\d:\d\d$/.test(f.hora);
  return (
    <div className="velo" onClick={onCerrar}>
      <div className="dialogo" onClick={e => e.stopPropagation()}>
        <h3>Nuevo turno</h3>
        <label className="fld"><span>Cliente</span><input className="input" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })} placeholder="Nombre del cliente" /></label>
        <label className="fld"><span>Servicios</span><input className="input" value={f.servicios} onChange={e => setF({ ...f, servicios: e.target.value })} placeholder="Skin fade + Afeitado" /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="fld"><span>Barbero</span>
            <select className="input" value={f.barbero} onChange={e => setF({ ...f, barbero: e.target.value })}>
              {barberos.map(([n]) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="fld"><span>Hora</span><input className="input" type="time" value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} /></label>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onCerrar}>Cancelar</button>
          <button className="btn primary" disabled={!listo} onClick={() => {
            const par = barberos.find(([n]) => n === f.barbero);
            T.crear({ cliente: f.cliente.trim(), servicios: f.servicios.trim(), barbero_nombre: par[0], barbero_id: par[1], hora: f.hora, estado: "espera" });
            onCerrar();
          }}><Ic d={I.mas} s={14} />Crear</button>
        </div>
      </div>
    </div>
  );
}

/* ── Vista: mi día (barbero) ── */
function VistaMiDia({ T, P, V, nombre, user }) {
  const mios = T.cola.filter(t => t.barbero_nombre === nombre);
  const actual = mios.find(t => t.estado === "silla" || t.estado === "pausado");
  const ultimoListo = [...mios].reverse().find(t => t.estado === "listo");
  const esperan = mios.filter(t => t.estado === "espera");
  const [confirma, setConfirma] = React.useState(null);
  const [noAt, setNoAt] = React.useState(null);
  const [venta, setVenta] = React.useState(false);
  return (
    <div className="mi-dia">
      {actual ? (
        <div className="silla-card">
          <span className="eyebrow">{actual.estado === "pausado" ? "Turno pausado" : "Atendiendo ahora"}</span>
          <span className="grande">{actual.codigo}</span>
          <div style={{ color: "var(--tx)", fontWeight: 600 }}>{actual.cliente}</div>
          <div className="tenue">{actual.servicios}</div>
          <EstadoTurno t={actual} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {actual.estado === "silla"
              ? <button className="btn outline" onClick={() => T.pausar(actual)}><Ic d={I.pausa} s={14} />Pausar</button>
              : <button className="btn outline" onClick={() => T.reanudar(actual)}><Ic d={I.play} s={14} />Reanudar</button>}
            <button className="btn ok" onClick={() => setConfirma(actual)}><Ic d={I.check} s={14} />Terminar</button>
            <button className="btn ghost" onClick={() => setNoAt(actual)}><Ic d={I.noAtendio} s={14} />No atendido</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center", padding: 26 }}>
          <span className="eyebrow">Silla libre</span>
          <button className="btn primary xl" disabled={!esperan.length} onClick={() => T.siguiente(nombre)}><Ic d={I.rayo} s={16} />Empezar siguiente turno</button>
          {ultimoListo && <button className="btn ghost sm" onClick={() => T.atras(ultimoListo)}><Ic d={I.atras} s={13} />Volver atrás ({ultimoListo.codigo})</button>}
          {!esperan.length && <span className="tenue">No tienes turnos en espera.</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ font: "400 20px/1 var(--disp)", textTransform: "uppercase" }}>Mi fila</h2>
        <span className="badge">{esperan.length} en espera</span>
        <button className="btn outline sm" style={{ marginLeft: "auto" }} onClick={() => setVenta(true)}><Ic d={I.carrito} s={13} />Vender producto</button>
      </div>
      {mios.filter(t => t.estado !== "silla" && t.estado !== "pausado").map(t => (
        <div key={t.id} className="turno-item" style={{ opacity: t.estado === "listo" ? .5 : 1 }}>
          <span className="cod" style={{ fontSize: 16 }}>{t.codigo}</span>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ color: "var(--tx)", fontWeight: 600 }}>{t.cliente}</div>
            <div className="tenue">{t.servicios} · <HoraTurno t={t} /></div>
          </div>
          {t.estado === "espera" && <button className="btn outline sm" onClick={() => T.llamar(t)}><Ic d={I.play} s={12} />Empezar</button>}
          {t.estado === "espera" && <button className="icon-btn" title="No atendido" onClick={() => setNoAt(t)}><Ic d={I.noAtendio} s={14} /></button>}
          {t.estado === "listo" && <button className="btn ghost sm" onClick={() => T.atras(t)}><Ic d={I.atras} s={12} />Devolver</button>}
          {t.estado === "cancelado" && <button className="btn ghost sm" onClick={() => T.atras(t)}><Ic d={I.atras} s={12} />Reactivar</button>}
        </div>
      ))}
      {!mios.length && <div className="card tenue">Hoy no tienes turnos asignados.</div>}
      {confirma && <DialogoConfirmar t={confirma} productos={P.activos} onOk={(m, items) => { T.confirmar(confirma, m, items, user, nombre); setConfirma(null); }} onNo={() => setConfirma(null)} />}
      {noAt && <DialogoNoAtendido t={noAt} onOk={m => { T.noAtendido(noAt, m); setNoAt(null); }} onNo={() => setNoAt(null)} />}
      {venta && <DialogoVenta productos={P.activos} onOk={items => { V.vender(items, user, nombre); setVenta(false); }} onNo={() => setVenta(false)} />}
    </div>
  );
}

/* ── Vista: sala ── */
function VistaSala({ T }) {
  const activos = T.cola.filter(t => t.estado === "silla" || t.estado === "pausado");
  const fila = T.cola.filter(t => t.estado === "espera").slice(0, 6);
  return (
    <div className="sala">
      <div className="sillas">
        {activos.length ? activos.map(t => (
          <div key={t.id} className="silla-card">
            <span className="eyebrow" style={{ color: t.estado === "pausado" ? "var(--warn)" : "var(--brand)" }}>{t.estado === "pausado" ? "En pausa" : "Atendiendo"}</span>
            <span className="grande">{t.codigo}</span>
            <div style={{ font: "600 15px var(--cond)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--tx)" }}>{t.servicios}</div>
            <div className="tenue">{t.barbero_nombre} · {transcurrido(t)} min</div>
          </div>
        )) : (
          <div className="silla-card"><span className="eyebrow">Sillas libres</span><span className="grande">—</span><div className="tenue">Pasa el siguiente</div></div>
        )}
      </div>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <span className="eyebrow">Siguen en la fila</span>
        {fila.map((t, i) => (
          <div key={t.id} style={{ display: "flex", gap: 14, alignItems: "center", borderBottom: i < fila.length - 1 ? "1px solid var(--line)" : "none", paddingBottom: i < fila.length - 1 ? 10 : 0 }}>
            <span style={{ font: "400 22px var(--disp)", color: "var(--tx-3)", width: 30 }}>{String(i + 1).padStart(2, "0")}</span>
            <span className="cod" style={{ fontSize: 17 }}>{t.codigo}</span>
            <span className="tenue" style={{ flex: 1 }}>{t.servicios} · {t.barbero_nombre}</span>
            <HoraTurno t={t} />
          </div>
        ))}
        {!fila.length && <span className="tenue">Nadie en espera.</span>}
      </div>
    </div>
  );
}

/* ── Vista: resumen del día (admin) ── */
/* Histórico por día para el dashboard (RPC resumen_diario, db/15). */
function useResumenDiario() {
  const [dias, setDias] = React.useState([]);
  React.useEffect(() => {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 13 * 86400000);
    const iso = d => d.toLocaleDateString("en-CA");
    sb.rpc("resumen_diario", { desde: iso(desde), hasta: iso(hasta) })
      .then(({ data }) => { if (data) setDias(data); });
  }, []);
  return dias;
}

const DIAS_CORTO = ["D", "L", "M", "X", "J", "V", "S"];

function VistaResumen({ T, V }) {
  const atendidos = T.cola.filter(t => t.estado === "listo");
  const noAtendidos = T.cola.filter(t => t.estado === "cancelado");
  const totalServicios = atendidos.reduce((a, t) => a + (t.precio_total || 0), 0);
  const totalProductos = V.ventas.reduce((a, v) => a + v.precio * v.cantidad, 0);
  const historia = useResumenDiario();
  const topeDia = Math.max(1, ...historia.map(d => Number(d.servicios_cop) + Number(d.productos_cop)));
  /* Top del equipo hoy: servicios cobrados por barbero + ventas por vendedor. */
  const porPersona = {};
  atendidos.forEach(t => {
    const p = porPersona[t.barbero_nombre] = porPersona[t.barbero_nombre] || { atendidos: 0, cop: 0 };
    p.atendidos += 1; p.cop += t.precio_total || 0;
  });
  V.ventas.forEach(v => {
    if (!v.vendedor) return;
    const p = porPersona[v.vendedor] = porPersona[v.vendedor] || { atendidos: 0, cop: 0 };
    p.cop += v.precio * v.cantidad;
  });
  const top = Object.entries(porPersona).sort((a, b) => b[1].cop - a[1].cop);
  const topeTop = Math.max(1, ...top.map(([, p]) => p.cop));
  return (
    <React.Fragment>
      <div className="stats" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="stat"><span className="eyebrow">Atendidos</span><b>{atendidos.length}</b></div>
        <div className="stat"><span className="eyebrow">No atendidos</span><b>{noAtendidos.length}</b></div>
        <div className="stat"><span className="eyebrow">Servicios</span><b style={{ fontSize: 24 }}>{fmtCOP(totalServicios)}</b></div>
        <div className="stat naranja"><span className="eyebrow">Total día (+ productos)</span><b style={{ fontSize: 24 }}>{fmtCOP(totalServicios + totalProductos)}</b></div>
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ font: "700 15px var(--cond)", textTransform: "uppercase", letterSpacing: ".05em" }}>Ingresos · últimos 14 días</h3>
          {/* Alturas en píxeles, no en %: dentro de un track auto de grid el
             porcentaje no resuelve y las barras colapsaban a nada. */}
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 120 }}>
            {historia.map(d => {
              const srv = Number(d.servicios_cop), prod = Number(d.productos_cop);
              const total = srv + prod;
              const px = v => Math.round(110 * v / topeDia);
              return (
                <div key={d.dia} title={d.dia + " · servicios " + fmtCOP(srv) + " · productos " + fmtCOP(prod)}
                  style={{ flex: 1, display: "grid", alignContent: "end", gap: 1 }}>
                  {prod > 0 && <div style={{ height: px(prod), background: "var(--info)", borderRadius: "3px 3px 0 0", opacity: .85 }} />}
                  <div style={{ height: Math.max(total > 0 ? 4 : 2, px(srv)), background: total > 0 ? "var(--brand)" : "var(--raised)", borderRadius: prod > 0 ? "0" : "3px 3px 0 0" }} />
                </div>
              );
            })}
            {!historia.length && <span className="tenue">Cargando…</span>}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {historia.map(d => (
              <span key={d.dia} className="tenue" style={{ flex: 1, textAlign: "center", fontSize: 10 }}>
                {DIAS_CORTO[new Date(d.dia + "T12:00:00").getDay()]}
              </span>
            ))}
          </div>
          <span className="tenue" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--brand)" }}>■</span> servicios · <span style={{ color: "var(--info)" }}>■</span> productos
          </span>
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ font: "700 15px var(--cond)", textTransform: "uppercase", letterSpacing: ".05em" }}>Top del equipo · hoy</h3>
          {top.map(([nombre, p]) => (
            <div key={nombre} style={{ display: "grid", gap: 5 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span className="avatar" style={{ width: 26, height: 26, fontSize: 12 }}>{nombre[0]}</span>
                <b style={{ color: "var(--tx)" }}>{nombre}</b>
                <span className="tenue">{p.atendidos} atendido{p.atendidos === 1 ? "" : "s"}</span>
                <b style={{ marginLeft: "auto", color: "var(--brand)" }}>{fmtCOP(p.cop)}</b>
              </div>
              <div style={{ height: 5, background: "var(--raised)", borderRadius: 99 }}>
                <div style={{ height: "100%", width: Math.round(100 * p.cop / topeTop) + "%", background: "var(--brand)", borderRadius: 99 }} />
              </div>
            </div>
          ))}
          {!top.length && <span className="tenue">Aún no hay atenciones ni ventas hoy.</span>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="eyebrow">Ventas de productos</span>
            <b style={{ color: "var(--tx)" }}>{fmtCOP(totalProductos)}</b>
          </div>
          {V.ventas.map(v => (
            <div key={v.id} style={{ display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--tx)", fontWeight: 600 }}>{v.nombre} × {v.cantidad}</div>
                <div className="tenue">{v.vendedor || "—"} · {new Date(v.creado_en).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
              <span style={{ color: "var(--brand)", fontWeight: 700 }}>{fmtCOP(v.precio * v.cantidad)}</span>
              <button className="icon-btn" title="Anular venta" onClick={() => V.anular(v)}><Ic d={I.basura} s={13} /></button>
            </div>
          ))}
          {!V.ventas.length && <span className="tenue">Sin ventas de productos hoy.</span>}
        </div>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <span className="eyebrow">No atendidos y motivos</span>
          {noAtendidos.map(t => (
            <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <span className="cod">{t.codigo}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--tx)", fontWeight: 600 }}>{t.cliente}</div>
                <div className="tenue">{t.motivo_no_atencion || "Sin motivo registrado"}</div>
              </div>
              <span className="tenue">{t.barbero_nombre}</span>
            </div>
          ))}
          {!noAtendidos.length && <span className="tenue">Todos los turnos del día se han atendido. 🎉</span>}
        </div>
      </div>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Atendidos hoy</span>
        {atendidos.map(t => (
          <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
            <span className="cod">{t.codigo}</span>
            <span style={{ color: "var(--tx)", fontWeight: 600 }}>{t.cliente}</span>
            <span className="tenue" style={{ flex: 1 }}>{t.servicios} · {t.barbero_nombre}</span>
            <span style={{ color: "var(--tx)", fontWeight: 700 }}>{fmtCOP(t.precio_total || 0)}</span>
          </div>
        ))}
        {!atendidos.length && <span className="tenue">Aún no hay atenciones confirmadas hoy.</span>}
      </div>
    </React.Fragment>
  );
}

/* ── Vista: productos (admin, CRUD completo) ── */
function VistaProductos({ P }) {
  const [form, setForm] = React.useState(null); // {id?, nombre, precio}
  const [borrar, setBorrar] = React.useState(null);
  return (
    <React.Fragment>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn primary" onClick={() => setForm({ nombre: "", precio: "" })}><Ic d={I.mas} s={14} />Nuevo producto</button>
        <span className="tenue">Gel, cera y lo que quieras comercializar. Los inactivos no aparecen al vender.</span>
      </div>
      <div className="tabla-wrap">
        <table className="tabla" style={{ minWidth: 520 }}>
          <thead><tr><th>Producto</th><th>Precio</th><th>Estado</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
          <tbody>
            {P.productos.map(pr => (
              <tr key={pr.id} className={pr.activo ? "" : "dim"}>
                <td style={{ color: "var(--tx)", fontWeight: 600 }}>{pr.nombre}</td>
                <td style={{ color: "var(--brand)", fontWeight: 700 }}>{fmtCOP(pr.precio)}</td>
                <td>
                  <button onClick={() => P.guardar(pr.id, { activo: !pr.activo }, pr.activo ? "Desactivado: " + pr.nombre : "Activado: " + pr.nombre)}>
                    <span className={"badge " + (pr.activo ? "ok" : "")}>{pr.activo ? "En venta" : "Inactivo"}</span>
                  </button>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn ghost sm" onClick={() => setForm({ id: pr.id, nombre: pr.nombre, precio: String(pr.precio) })}>Editar</button>
                    <button className="icon-btn" onClick={() => setBorrar(pr)} aria-label={"Eliminar " + pr.nombre}><Ic d={I.basura} s={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!P.productos.length && <tr><td colSpan={4} className="tenue" style={{ textAlign: "center", padding: 26 }}>Sin productos. Crea el primero.</td></tr>}
          </tbody>
        </table>
      </div>
      {form && (
        <div className="velo" onClick={() => setForm(null)}>
          <div className="dialogo" onClick={e => e.stopPropagation()}>
            <h3>{form.id ? "Editar producto" : "Nuevo producto"}</h3>
            <label className="fld"><span>Nombre</span><input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Gel fijador" /></label>
            <label className="fld"><span>Precio (COP)</span><input className="input" type="number" min="0" step="500" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} placeholder="25000" /></label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn primary" disabled={form.nombre.trim().length < 2 || !(parseInt(form.precio, 10) >= 0)} onClick={() => {
                P.guardar(form.id || null, { nombre: form.nombre.trim(), precio: parseInt(form.precio, 10) || 0 }, form.id ? "Producto actualizado" : "Producto creado");
                setForm(null);
              }}><Ic d={I.check} s={14} />Guardar</button>
            </div>
          </div>
        </div>
      )}
      {borrar && (
        <div className="velo" onClick={() => setBorrar(null)}>
          <div className="dialogo" onClick={e => e.stopPropagation()}>
            <h3>Eliminar producto</h3>
            <p style={{ margin: 0 }}>Se elimina <b style={{ color: "var(--tx)" }}>{borrar.nombre}</b> del catálogo (las ventas ya registradas se conservan). Si solo quieres pausarlo, usa "Inactivo".</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setBorrar(null)}>Cancelar</button>
              <button className="btn danger" onClick={() => { P.eliminar(borrar); setBorrar(null); }}><Ic d={I.basura} s={14} />Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

/* ── Vista: ajustes — edita la página pública (fase 2) ── */
const CATS = [["cortes", "Cortes"], ["spa", "Spa y masajes"], ["barberia", "Barbería"]];
const ESTADOS = { disponible: ["Visible", "ok"], agotado: ["No disponible", "warn"], borrador: ["Borrador", ""] };
const sigEstado = e => e === "disponible" ? "agotado" : e === "agotado" ? "borrador" : "disponible";
const miniImg = im => /^https?:/.test(im || "") ? im : "/assets/servicios/" + im + ".jpeg";

function VistaAjustes({ C }) {
  const n = C.negocio;
  const [contacto, setContacto] = React.useState(null);
  const [horario, setHorario] = React.useState(null);
  const [equipo, setEquipo] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [borrar, setBorrar] = React.useState(null);
  React.useEffect(() => {
    if (!n) return;
    setContacto({ nombre: n.nombre || "", telefono: n.telefono || "", direccion: n.direccion || "" });
    setHorario(Object.assign({ dias: "", etiqueta: "", apertura: 12, fin: 21, cierre: "", nota: "" }, n.horario || {}));
    setEquipo((n.equipo || []).map(m => ({ ...m })));
  }, [n && n.id, n && n.actualizado_en]);
  if (!n || !contacto || !horario || !equipo) return <div className="card tenue">Cargando el contenido de la página…</div>;

  const fld = (obj, setObj, campo, etiqueta, props) => (
    <label className="fld"><span>{etiqueta}</span>
      <input className="input" value={obj[campo] == null ? "" : obj[campo]} onChange={e => setObj({ ...obj, [campo]: props && props.type === "number" ? (e.target.value === "" ? "" : parseInt(e.target.value, 10)) : e.target.value })} {...(props || {})} />
    </label>
  );

  return (
    <React.Fragment>
      <p className="tenue" style={{ margin: 0 }}>Todo lo que guardes aquí queda <b style={{ color: "var(--tx)" }}>publicado en la página pública</b> — los visitantes lo ven al entrar o recargar.</p>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ font: "700 15px var(--cond)", textTransform: "uppercase", letterSpacing: ".05em" }}>Contacto</h3>
          {fld(contacto, setContacto, "nombre", "Nombre del negocio")}
          {fld(contacto, setContacto, "telefono", "WhatsApp (con indicativo, sin signos)", { placeholder: "573205042058", inputMode: "numeric" })}
          {fld(contacto, setContacto, "direccion", "Dirección")}
          <button className="btn primary" style={{ justifySelf: "end" }} disabled={!contacto.telefono.trim() || contacto.nombre.trim().length < 2}
            onClick={() => C.guardarNegocio({ nombre: contacto.nombre.trim(), telefono: contacto.telefono.replace(/\D/g, ""), direccion: contacto.direccion.trim() }, "Contacto publicado")}>
            <Ic d={I.check} s={14} />Guardar y publicar</button>
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ font: "700 15px var(--cond)", textTransform: "uppercase", letterSpacing: ".05em" }}>Horario de atención</h3>
          {fld(horario, setHorario, "dias", "Días", { placeholder: "De miércoles a lunes" })}
          {fld(horario, setHorario, "etiqueta", "Texto visible", { placeholder: "12:00 p.m — 9:00 p.m" })}
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            {fld(horario, setHorario, "apertura", "Abre (0–23)", { type: "number", min: 0, max: 23 })}
            {fld(horario, setHorario, "fin", "Cierra (0–23)", { type: "number", min: 1, max: 23 })}
          </div>
          {fld(horario, setHorario, "cierre", "Día cerrado", { placeholder: "Martes cerrado" })}
          {fld(horario, setHorario, "nota", "Nota")}
          <button className="btn primary" style={{ justifySelf: "end" }} disabled={!(horario.apertura >= 0) || !(horario.fin > horario.apertura)}
            onClick={() => C.guardarNegocio({ horario }, "Horario publicado")}>
            <Ic d={I.check} s={14} />Guardar y publicar</button>
        </div>

        <div className="card" style={{ display: "grid", gap: 10, gridColumn: "1 / -1" }}>
          <h3 style={{ font: "700 15px var(--cond)", textTransform: "uppercase", letterSpacing: ".05em" }}>Imágenes de marca</h3>
          <span className="tenue">El banner a lo ancho y el logo del pie de página. Subir reemplaza; "Original" vuelve al arte del sitio. Las fotos de los cortes se cambian abajo, en la carta.</span>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {[["banner", "Banner de marca", "/assets/banner.jpeg", { width: "100%", height: 74, objectFit: "cover" }],
              ["logo", "Logo del pie", "/assets/logo-911-urban-salon-dark.png", { height: 74, objectFit: "contain" }]].map(([clave, titulo, porDefecto, estilo]) => {
              const subida = (n.imagenes || {})[clave];
              return (
                <div key={clave} style={{ display: "grid", gap: 8 }}>
                  <span className="eyebrow">{titulo}{subida ? " · personalizada" : " · original"}</span>
                  <img src={subida || porDefecto} alt="" style={{ ...estilo, borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", justifySelf: "start" }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <label className="btn ghost sm" style={{ cursor: "pointer" }}>
                      <Ic d={I.foto} s={13} />Subir nueva
                      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={e => { C.subirImagenMarca(clave, e.target.files[0]); e.target.value = ""; }} />
                    </label>
                    {subida && <button className="btn ghost sm" onClick={() => C.quitarImagenMarca(clave)}><Ic d={I.atras} s={13} />Original</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 10, gridColumn: "1 / -1" }}>
          <h3 style={{ font: "700 15px var(--cond)", textTransform: "uppercase", letterSpacing: ".05em" }}>Equipo en la página</h3>
          <span className="tenue">Los nombres y especialidades que ve el público. (Las cuentas de acceso al panel son aparte.)</span>
          <div style={{ display: "grid", gap: 8 }}>
            {equipo.map((m, i) => (
              <div key={i} style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 130px 1.4fr", alignItems: "end" }}>
                {fld(m, v => setEquipo(equipo.map((x, j) => j === i ? v : x)), "nombre", i === 0 ? "Nombre" : "")}
                {fld(m, v => setEquipo(equipo.map((x, j) => j === i ? v : x)), "rol", i === 0 ? "Rol" : "")}
                {fld(m, v => setEquipo(equipo.map((x, j) => j === i ? v : x)), "especialidad", i === 0 ? "Especialidad" : "")}
              </div>
            ))}
          </div>
          <button className="btn primary" style={{ justifySelf: "end" }} disabled={equipo.some(m => !(m.nombre || "").trim())}
            onClick={() => C.guardarNegocio({ equipo }, "Equipo publicado")}>
            <Ic d={I.check} s={14} />Guardar y publicar</button>
        </div>

        {CATS.map(([cat, titulo]) => {
          const filas = C.servicios.filter(s => s.categoria === cat);
          return (
            <div key={cat} className="card" style={{ display: "grid", gap: 10, gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <h3 style={{ font: "700 15px var(--cond)", textTransform: "uppercase", letterSpacing: ".05em", flex: 1 }}>Carta · {titulo}</h3>
                <button className="btn ghost sm" onClick={() => setForm({ categoria: cat, nombre: "", precio: "", dur_min: "", descripcion: "", badge: "", duraciones: {} })}><Ic d={I.mas} s={13} />Nuevo</button>
              </div>
              <div className="tabla-wrap">
                <table className="tabla" style={{ minWidth: 640 }}>
                  <thead><tr>{cat === "cortes" && <th style={{ width: 54 }}>Foto</th>}<th>Servicio</th><th>Precio</th><th>Duración</th><th>En la página</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
                  <tbody>
                    {filas.map(s => {
                      const [etq, tono] = ESTADOS[s.estado] || ESTADOS.disponible;
                      return (
                        <tr key={s.id} className={s.estado === "borrador" ? "dim" : ""}>
                          {cat === "cortes" && <td>{s.img ? <img src={miniImg(s.img)} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, border: "1px solid var(--bd)" }} /> : <span className="tenue">—</span>}</td>}
                          <td style={{ color: "var(--tx)", fontWeight: 600 }}>{s.nombre}{s.descripcion && <div className="tenue" style={{ fontWeight: 400, fontSize: 12 }}>{s.descripcion}</div>}</td>
                          <td style={{ color: "var(--brand)", fontWeight: 700 }}>{fmtCOP(s.precio)}</td>
                          <td>{s.dur_min} min{s.duraciones && Object.keys(s.duraciones).length ? <span className="tenue" title={Object.entries(s.duraciones).map(([q, v]) => q + ": " + v + " min").join(" · ")}> · varía</span> : null}</td>
                          <td><button title="Cambiar visibilidad" onClick={() => C.guardarServicio(s.id, { estado: sigEstado(s.estado) }, ESTADOS[sigEstado(s.estado)][0] + ": " + s.nombre)}><span className={"badge " + tono}>{etq}</span></button></td>
                          <td>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              {cat === "cortes" && (
                                <label className="btn ghost sm" style={{ cursor: "pointer" }} title="Subir foto nueva">
                                  <Ic d={I.foto} s={13} />Foto
                                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={e => { C.subirFoto(s, e.target.files[0]); e.target.value = ""; }} />
                                </label>
                              )}
                              <button className="btn ghost sm" onClick={() => setForm({ id: s.id, categoria: cat, nombre: s.nombre, precio: String(s.precio), dur_min: String(s.dur_min), descripcion: s.descripcion || "", badge: s.badge || "", duraciones: s.duraciones || {} })}><Ic d={I.lapiz} s={13} />Editar</button>
                              <button className="icon-btn" onClick={() => setBorrar(s)} aria-label={"Eliminar " + s.nombre}><Ic d={I.basura} s={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filas.length && <tr><td colSpan={6} className="tenue" style={{ textAlign: "center", padding: 22 }}>Sin servicios en esta categoría.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {form && (
        <div className="velo" onClick={() => setForm(null)}>
          <div className="dialogo" onClick={e => e.stopPropagation()}>
            <h3>{form.id ? "Editar servicio" : "Nuevo servicio"}</h3>
            <label className="fld"><span>Nombre</span><input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Skin fade" /></label>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label className="fld"><span>Precio (COP)</span><input className="input" type="number" min="0" step="1000" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} placeholder="50000" /></label>
              <label className="fld"><span>Duración (min)</span><input className="input" type="number" min="5" step="5" value={form.dur_min} onChange={e => setForm({ ...form, dur_min: e.target.value })} placeholder="45" /></label>
            </div>
            <label className="fld"><span>Descripción (opcional)</span><input className="input" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} /></label>
            {form.categoria === "cortes" && <label className="fld"><span>Etiqueta (opcional)</span><input className="input" value={form.badge} onChange={e => setForm({ ...form, badge: e.target.value })} placeholder="Más pedido" /></label>}
            {/* Cada persona puede tardar distinto: minutos por integrante del
                equipo; vacío usa la duración base. La landing y la reserva web
                usan el tiempo de quien atiende. */}
            <div style={{ display: "grid", gap: 8 }}>
              <span className="tenue" style={{ fontSize: 12 }}>Tiempo por persona (opcional — vacío usa la base)</span>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
                {((C.negocio && C.negocio.equipo) || []).filter(m => {
                  const masajista = (m.rol || "").toLowerCase().includes("masajista");
                  return form.categoria === "spa" ? masajista : !masajista;
                }).map(m => (
                  <label key={m.nombre} className="fld"><span>{m.nombre}</span>
                    <input className="input" type="number" min="5" step="5" placeholder={form.dur_min || "base"}
                      value={form.duraciones[m.nombre] == null ? "" : form.duraciones[m.nombre]}
                      onChange={e => setForm({ ...form, duraciones: { ...form.duraciones, [m.nombre]: e.target.value } })} />
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn primary" disabled={form.nombre.trim().length < 2 || !(parseInt(form.precio, 10) >= 0) || !(parseInt(form.dur_min, 10) > 0)} onClick={() => {
                const duraciones = {};
                Object.entries(form.duraciones || {}).forEach(([quien, v]) => {
                  const n = parseInt(v, 10);
                  if (n > 0) duraciones[quien] = n;
                });
                C.guardarServicio(form.id || null, {
                  categoria: form.categoria, nombre: form.nombre.trim(), precio: parseInt(form.precio, 10) || 0,
                  dur_min: parseInt(form.dur_min, 10) || 45, descripcion: form.descripcion.trim() || null, badge: form.badge.trim() || null,
                  duraciones: Object.keys(duraciones).length ? duraciones : null
                }, form.id ? "Publicado: " + form.nombre : "En la carta: " + form.nombre);
                setForm(null);
              }}><Ic d={I.check} s={14} />Guardar y publicar</button>
            </div>
          </div>
        </div>
      )}
      {borrar && (
        <div className="velo" onClick={() => setBorrar(null)}>
          <div className="dialogo" onClick={e => e.stopPropagation()}>
            <h3>Eliminar de la carta</h3>
            <p style={{ margin: 0 }}><b style={{ color: "var(--tx)" }}>{borrar.nombre}</b> desaparece de la página pública. Si es temporal, mejor pásalo a "No disponible" o "Borrador".</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setBorrar(null)}>Cancelar</button>
              <button className="btn danger" onClick={() => { C.eliminarServicio(borrar); setBorrar(null); }}><Ic d={I.basura} s={14} />Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

/* ── Login ── */
function Login({ onOk, avisar }) {
  const [usuario, setUsuario] = React.useState("");
  const [clave, setClave] = React.useState("");
  const [cargando, setCargando] = React.useState(false);
  async function entrar(e) {
    e.preventDefault();
    setCargando(true);
    const email = usuario.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") + "@911urban.local";
    const { data, error } = await sb.auth.signInWithPassword({ email, password: clave });
    setCargando(false);
    if (error) avisar("Usuario o contraseña incorrectos", true);
    else onOk(data.session);
  }
  return (
    <div className="login">
      <form className="card" onSubmit={entrar}>
        <img src="/assets/logo-911-urban-salon-dark.png" alt="911 Urban Salón" />
        <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
          <span className="eyebrow" style={{ color: "var(--brand)" }}>Panel del salón</span>
          <h2 style={{ font: "400 24px/1 var(--disp)", textTransform: "uppercase" }}>Solo el equipo</h2>
        </div>
        <label className="fld" style={{ width: "100%" }}><span>Usuario</span>
          <input className="input" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="admin o tu nombre" autoComplete="username" />
        </label>
        <label className="fld" style={{ width: "100%" }}><span>Contraseña</span>
          <input className="input" type="password" value={clave} onChange={e => setClave(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </label>
        <button className="btn primary" style={{ width: "100%", height: 42 }} disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}

/* ── Shell ── */
function Shell({ sesion, salir }) {
  const meta = sesion.user.app_metadata || {};
  const rol = meta.rol || "barbero";
  const nombre = meta.nombre || "Equipo";
  const admin = rol === "admin";
  const [avisar, toastsUI] = useToasts();
  const T = useTurnos(avisar);
  const P = useProductos(avisar);
  const V = useVentas(avisar);
  const C = useContenido(avisar);
  const [vista, setVista] = React.useState(admin ? "cola" : "midia");
  const titulo = { cola: "Cola de hoy", midia: "Mi día", resumen: "Resumen del día", productos: "Productos", sala: "Pantalla de sala", ajustes: "Ajustes" }[vista];
  const fecha = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="shell">
      <aside className="side">
        <div className="marca">
          <img src="/assets/logo-911-urban-salon-dark.png" alt="" />
          <div style={{ display: "grid" }}>
            <b style={{ font: "700 13px var(--cond)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--tx)" }}>911 Urban</b>
            <span className="eyebrow">Turnos</span>
          </div>
        </div>
        <nav>
          {admin && <button className={"nav-item" + (vista === "cola" ? " on" : "")} onClick={() => setVista("cola")}><Ic d={I.cola} s={15} />Cola</button>}
          {!admin && <button className={"nav-item" + (vista === "midia" ? " on" : "")} onClick={() => setVista("midia")}><Ic d={I.usuario} s={15} />Mi día</button>}
          {admin && <button className={"nav-item" + (vista === "resumen" ? " on" : "")} onClick={() => setVista("resumen")}><Ic d={I.caja} s={15} />Resumen</button>}
          {admin && <button className={"nav-item" + (vista === "productos" ? " on" : "")} onClick={() => setVista("productos")}><Ic d={I.carrito} s={15} />Productos</button>}
          <button className={"nav-item" + (vista === "sala" ? " on" : "")} onClick={() => setVista("sala")}><Ic d={I.tv} s={15} />Sala</button>
          {admin && <button className={"nav-item" + (vista === "ajustes" ? " on" : "")} onClick={() => setVista("ajustes")}><Ic d={I.ajustes} s={15} />Ajustes</button>}
        </nav>
        <div className="user-card">
          <div className="quien">
            <span className="avatar">{nombre[0]}</span>
            <span className="det" style={{ display: "grid" }}>
              <b style={{ color: "var(--tx)", fontSize: 14 }}>{nombre}</b>
              <span className="eyebrow">{admin ? "Administración" : "Barbero"}</span>
            </span>
            <button className="icon-btn" style={{ marginLeft: "auto" }} title="Salir" onClick={salir}><Ic d={I.salir} /></button>
          </div>
        </div>
      </aside>
      <main className="zona">
        <div className="topbar">
          <h1>{titulo}</h1>
          <span className="tenue" style={{ textTransform: "capitalize" }}>{fecha}</span>
          <span className={"badge " + (T.vivo ? "ok vivo" : "warn")} style={{ marginLeft: "auto" }}><span className="pt" />{T.vivo ? "En vivo" : "Conectando…"}</span>
        </div>
        {vista === "cola" && admin && <VistaCola T={T} P={P} user={sesion.user.id} nombreUser={nombre} />}
        {vista === "midia" && !admin && <VistaMiDia T={T} P={P} V={V} nombre={nombre} user={sesion.user.id} />}
        {vista === "resumen" && admin && <VistaResumen T={T} V={V} />}
        {vista === "productos" && admin && <VistaProductos P={P} />}
        {vista === "sala" && <VistaSala T={T} />}
        {vista === "ajustes" && admin && <VistaAjustes C={C} />}
      </main>
      {toastsUI}
    </div>
  );
}

function App() {
  const [sesion, setSesion] = React.useState(null);
  const [listo, setListo] = React.useState(false);
  const [avisar, toastsUI] = useToasts();
  React.useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSesion(data.session); setListo(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (!listo) return null;
  if (!sesion) return <React.Fragment><Login onOk={setSesion} avisar={avisar} />{toastsUI}</React.Fragment>;
  return <Shell sesion={sesion} salir={() => sb.auth.signOut()} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
