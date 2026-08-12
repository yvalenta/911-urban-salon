
/* Reemplaza el TurnosAsistente del bundle: selector de servicio categorizado
   (cortes / spa / barbería) con chips más legibles: nombre grande, duración y precio. */
(() => {
const { SectionHeading, Card, Badge, Button, Icon, Input, OptionChip, StepIndicator, BarberCard, SlotPicker, QueueStatus, TurnoTicket } = window.Ds911UrbanSalNDesignSystem_1e06a9;

/* Móvil: variantes compactas e interactivas (carruseles y acordeones). */
function useMovil() {
  const [m, setM] = React.useState(() => window.matchMedia("(max-width: 640px)").matches);
  React.useEffect(() => {
    const q = window.matchMedia("(max-width: 640px)");
    const f = e => setM(e.matches);
    q.addEventListener("change", f); return () => q.removeEventListener("change", f);
  }, []);
  return m;
}

/* Carrusel con scroll-snap: se desliza con el dedo, asoma la siguiente tarjeta. */
function Carrusel({ children, ancho }) {
  return (
    <div className="c-snap" style={{ display: "flex", gap: "var(--sp-3)", overflowX: "auto", scrollSnapType: "x mandatory", scrollPadding: "var(--gutter)", margin: "0 calc(-1 * var(--gutter))", padding: "4px var(--gutter) 8px", WebkitOverflowScrolling: "touch" }}>
      {React.Children.map(children, ch => <div style={{ flex: "0 0 " + (ancho || "76%"), scrollSnapAlign: "center", display: "grid" }}>{ch}</div>)}
    </div>
  );
}

function PistaDesliza() {
  return <span style={{ font: "600 var(--fs-3xs)/1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--text-faint)", justifySelf: "end" }}>Desliza →</span>;
}

/* Plegable: acordeón compacto para listas largas en móvil. */
function Plegable({ titulo, extra, abierto, children }) {
  const [open, setOpen] = React.useState(!!abierto);
  return (
    <div style={{ border: "1px solid var(--border-hair)", borderRadius: "var(--radius-sm)", background: "var(--surface-card)", overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "flex", width: "100%", alignItems: "center", gap: "var(--sp-3)", padding: "13px var(--sp-4)" }}>
        {extra}
        <span style={{ font: "700 var(--fs-sm)/1.25 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wide)", color: "var(--text-strong)", flex: 1 }}>{titulo}</span>
        <span style={{ color: "var(--naranja-500)", flex: "0 0 auto", display: "grid" }}><Icon name={open ? "minus" : "plus"} size={16} /></span>
      </button>
      {open && <div style={{ padding: "0 var(--sp-4) var(--sp-4)" }}>{children}</div>}
    </div>
  );
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function proximosDias(n = 5) {
  const out = []; const d = new Date();
  while (out.length < n) {
    if (d.getDay() !== 2) out.push({ key: d.toDateString(), etiqueta: DIAS[d.getDay()] + " " + d.getDate(), largo: DIAS[d.getDay()] + " " + d.getDate() + " " + MESES[d.getMonth()] });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ── Fase 3: cola real y reservas reales ──────────────────────────────────
   La disponibilidad ya no se simula: sale de cola_publica (la vista saneada
   de la cola del día — sin nombres ni teléfonos) y la reserva la escribe
   reservar_turno en el servidor, que serializa requests simultáneos por
   barbero+día y rechaza solapes. db/12_reservas_landing.sql. */
const SB_URL_911 = "https://ssrrkcshhrggukknkoua.supabase.co";
const SB_KEY_911 = "sb_publishable_zLevCihGrnQqqlgM7mXbrw_HyBtvzIj"; // pública por diseño
const hoyLocalISO = () => new Date().toLocaleDateString("en-CA");
const aMin911 = h => { const [H, M] = String(h || "").slice(0, 5).split(":").map(Number); return (H || 0) * 60 + (M || 0); };
const horaTexto = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

function useColaViva() {
  const [cola, setCola] = React.useState([]);
  const refrescar = React.useCallback(async () => {
    try {
      const r = await fetch(SB_URL_911 + "/rest/v1/rpc/cola_publica", {
        method: "POST", headers: { apikey: SB_KEY_911, "Content-Type": "application/json" },
        body: JSON.stringify({ dia: hoyLocalISO() })
      });
      if (r.ok) setCola(await r.json());
    } catch (e) { /* sin red: se queda la última lectura */ }
  }, []);
  React.useEffect(() => {
    refrescar();
    /* Cada 45 s y al volver la pestaña al frente: suficiente para que dos
       personas mirando a la vez vean lo mismo sin castigar la base — y el
       choque real lo resuelve el servidor al reservar, no esta lectura. */
    const iv = setInterval(refrescar, 45000);
    const desp = () => { if (!document.hidden) refrescar(); };
    document.addEventListener("visibilitychange", desp);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", desp); };
  }, [refrescar]);
  return [cola, refrescar];
}

/* Franjas reales: hoy arranca en la hora actual (nunca ofrece las 12:00 a las
   2:50pm), tacha las que pisan turnos activos del barbero y antepone "Ahora"
   cuando el salón está abierto y no hay nadie esperando ni agendado que
   choque con el bloque que empezaría ya mismo. */
function construirJornadas(fechaKey, barbero, cola, durTotal) {
  const H = window.DATA_911.horario || { apertura: 12, fin: 21, etiqueta: "12:00 p.m — 9:00 p.m" };
  const esHoy = fechaKey === new Date().toDateString();
  const ahora = new Date();
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const dur = Math.max(15, durTotal || 45);
  const ocupados = (cola || []).filter(t => t.barbero_nombre === barbero)
    .map(t => { const i = aMin911(t.hora); return [i, i + (t.dur_min || 45)]; });
  const pisa = m => ocupados.some(([i, f]) => m < f && m + dur > i);
  const slots = [];
  if (esHoy && barbero && ahoraMin >= H.apertura * 60 && ahoraMin + dur <= H.fin * 60 && !pisa(ahoraMin)) {
    slots.push({ hora: "Ahora", tomado: false });
  }
  for (let m = H.apertura * 60; m + dur <= H.fin * 60; m += 45) {
    if (esHoy && m < ahoraMin) continue; // lo pasado no se ofrece
    slots.push({ hora: horaTexto(m), tomado: pisa(m) });
  }
  return [{ nombre: esHoy ? "Hoy · cola en vivo" : "Jornada", rango: H.etiqueta, slots }];
}

function ChipServicio({ s, selected, onClick }) {
  const agotado = s.estado === "agotado";
  const chip = (
    <OptionChip selected={selected} onClick={agotado ? undefined : onClick}>
      <span style={{ display: "grid", gap: 3, textAlign: "left", padding: "2px 0" }}>
        <span style={{ font: "700 var(--fs-sm)/1.1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wide)" }}>{s.nombre}</span>
        <span style={{ font: "500 var(--fs-3xs)/1.1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", opacity: .75 }}>{agotado ? "No disponible" : s.dur + (s.precio ? " · " + s.precio : "")}</span>
      </span>
    </OptionChip>
  );
  return agotado ? <span aria-disabled="true" style={{ opacity: .45, pointerEvents: "none", display: "inline-flex" }}>{chip}</span> : chip;
}

function TurnosAsistente({ servicioInicial }) {
  const D = window.DATA_911;
  const movil = useMovil();
  const dias = React.useMemo(() => proximosDias(5), []);
  const [colaViva, refrescarCola] = useColaViva();
  const grupos = [
    { titulo: "Cortes / motilados", icon: "scissors", cat: "cortes", items: D.cortes },
    { titulo: "Spa y masajes", icon: "hand-heart", cat: "spa", items: D.spa },
    { titulo: "Barbería y otros", icon: "spray-can", cat: "barberia", items: D.barberia || [] }
  ].map(g => ({
    ...g,
    items: g.items.filter(s => s.estado !== "borrador").map(s => ({ nombre: s.nombre, dur: s.dur, durs: s.durs, precio: s.precio, estado: s.estado, cat: g.cat, spa: g.cat === "spa" }))
  })).filter(g => g.items.length);
  const reservables = grupos.flatMap(g => g.items).filter(s => s.estado !== "agotado");

  /* Regla general: se combinan varios servicios, pero solo UN corte por turno. */
  const [seleccion, setSeleccion] = React.useState([]);
  const [paso, setPaso] = React.useState(0);
  const [barbero, setBarbero] = React.useState(null);
  const [dia, setDia] = React.useState(dias[0].key);
  const [hora, setHora] = React.useState(null);
  const [nombre, setNombre] = React.useState("");
  const [tel, setTel] = React.useState("");
  const [turno, setTurno] = React.useState(null);
  const [auto, setAuto] = React.useState(false);

  const precioNum = p => parseInt(String(p || "").replace(/[^0-9]/g, ""), 10) || 0;
  const durNum = d => parseInt(String(d || "").replace(/[^0-9]/g, ""), 10) || 0;
  /* La duración depende de QUIÉN atiende: durs es el mapa persona→minutos
     que se edita en /admin; sin entrada para esa persona, aplica la base. */
  const durDe = (s, persona) => (s.durs && persona && parseInt(s.durs[persona], 10)) || durNum(s.dur);
  const totalMinCon = persona => seleccion.reduce((a, s) => a + durDe(s, persona), 0);
  const totalPrecio = seleccion.reduce((a, s) => a + precioNum(s.precio), 0);
  const totalMin = seleccion.reduce((a, s) => a + durNum(s.dur), 0);
  const totalVigente = barbero ? totalMinCon(barbero) : totalMin;
  const TOPE_WEB_MIN = 180; // reservas web: máximo 3 horas por combo (el servidor también lo exige)
  const fmtPrecio = n => "$" + n.toLocaleString("es-CO");
  const fmtDur = m => m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min";
  const nombresSel = seleccion.map(s => s.nombre).join(" + ");

  const [avisoTope, setAvisoTope] = React.useState(false);
  function alternar(s) {
    setSeleccion(sel => {
      const ya = sel.some(x => x.nombre === s.nombre);
      if (ya) { setAvisoTope(false); return sel.filter(x => x.nombre !== s.nombre); }
      const nuevo = s.cat === "cortes" ? [...sel.filter(x => x.cat !== "cortes"), s] : [...sel, s];
      /* Tope web: el combo no puede pasar de 3 horas (con la duración base;
         el servidor re-verifica con la duración real del barbero elegido). */
      if (nuevo.reduce((a, x) => a + durNum(x.dur), 0) > TOPE_WEB_MIN) { setAvisoTope(true); return sel; }
      setAvisoTope(false);
      return nuevo;
    });
    setBarbero(null); setHora(null);
  }

  React.useEffect(() => {
    if (!servicioInicial) return;
    const s = reservables.find(x => x.nombre === servicioInicial);
    if (s) { setSeleccion([s]); setPaso(1); setBarbero(null); setHora(null); }
  }, [servicioInicial]);

  /* Quién atiende: barberos si hay servicios de silla, masajistas si hay spa;
     con mezcla se muestran ambos y el elegido coordina el resto. */
  const haySpa = seleccion.some(s => s.spa);
  const haySilla = seleccion.some(s => !s.spa);
  const equipo = D.equipo.filter(p => {
    const esMasajista = p.rol.toLowerCase().includes("masajista");
    if (!seleccion.length) return true;
    return (haySpa && esMasajista) || (haySilla && !esMasajista);
  });
  const jornadas = React.useMemo(() => construirJornadas(dia, barbero || "", colaViva, totalVigente), [dia, barbero, colaViva, totalVigente]);

  /* Estado real de cada persona del equipo, derivado de la cola viva: en
     silla = atendiendo; su "próximo" es la primera franja libre real, medida
     con LO QUE ESA PERSONA tarda en los servicios elegidos. */
  const estadoVivo = React.useCallback(p => {
    const suyos = colaViva.filter(t => t.barbero_nombre === p.nombre);
    const atendiendo = suyos.some(t => t.estado === "silla" || t.estado === "pausado");
    const js = construirJornadas(dias[0].key, p.nombre, colaViva, totalMinCon(p.nombre) || 45);
    const libre = js[0].slots.find(s => !s.tomado);
    return { estado: atendiendo ? "turno" : "libre", proximo: libre ? libre.hora : "mañana" };
  }, [colaViva, dias, seleccion]);

  function asignarAutomatico() {
    const sel = seleccion.length ? seleccion : (reservables.length ? [reservables[0]] : []);
    if (!sel.length) return;
    const conSpa = sel.some(s => s.spa), conSilla = sel.some(s => !s.spa);
    const aptos = D.equipo.filter(p => {
      const esMasajista = p.rol.toLowerCase().includes("masajista");
      return (conSpa && esMasajista) || (conSilla && !esMasajista);
    });
    /* El hueco más cercano REAL: por cada persona apta se miran sus franjas
       de hoy contra la cola viva — con la duración de ESA persona — y gana
       quien atienda antes ("Ahora" primero). */
    let mejor = null;
    for (const p of aptos) {
      const durSel = sel.reduce((a, s) => a + durDe(s, p.nombre), 0) || 45;
      const js = construirJornadas(dias[0].key, p.nombre, colaViva, durSel);
      const libre = js[0].slots.find(x => !x.tomado);
      if (!libre) continue;
      const rango = libre.hora === "Ahora" ? -1 : aMin911(libre.hora);
      if (!mejor || rango < mejor.rango) mejor = { p, hora: libre.hora, rango };
    }
    if (!mejor) { mejor = { p: aptos[0] || D.equipo[0], hora: null }; }
    setSeleccion(sel); setBarbero(mejor.p.nombre); setDia(dias[0].key); setHora(mejor.hora); setAuto(true); setPaso(3);
  }

  const [reservando, setReservando] = React.useState(false);
  const [errorReserva, setErrorReserva] = React.useState(null);
  /* La reserva es REAL: reservar_turno inserta en la cola con candado por
     barbero+día y rechazo de solapes en el servidor. Si dos personas piden a
     la vez el mismo hueco, una gana y la otra ve el aviso y las franjas ya
     actualizadas. */
  async function confirmar() {
    if (reservando) return;
    setReservando(true); setErrorReserva(null);
    const d = dias.find(x => x.key === dia);
    const ahora = new Date();
    const horaReal = hora === "Ahora"
      ? horaTexto(ahora.getHours() * 60 + ahora.getMinutes())
      : hora;
    try {
      const r = await fetch(SB_URL_911 + "/rest/v1/rpc/reservar_turno", {
        method: "POST", headers: { apikey: SB_KEY_911, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_cliente: nombre.trim(), p_telefono: tel.replace(/\D/g, ""), p_servicios: nombresSel,
          p_barbero: barbero, p_fecha: new Date(dia).toLocaleDateString("en-CA"),
          p_hora: horaReal, p_dur: totalVigente || 45, p_precio: totalPrecio
        })
      });
      const cuerpo = await r.json();
      if (!r.ok) throw new Error((cuerpo && cuerpo.message) || "No se pudo reservar. Intenta de nuevo.");
      const res = Array.isArray(cuerpo) ? cuerpo[0] : cuerpo;
      setTurno({ codigo: res.codigo, servicio: nombresSel, barbero, fecha: d.largo, hora: hora === "Ahora" ? "Ahora (" + horaReal + ")" : hora, posicion: res.posicion });
      setPaso(4);
    } catch (e) {
      setErrorReserva(e.message);
      if (/ocuparse/.test(e.message)) { setHora(null); setPaso(2); } // franjas frescas para re-elegir
    } finally {
      setReservando(false);
      refrescarCola();
    }
  }

  const pasos = ["Servicio", "Barbero", "Hora", "Datos"];
  const puedeSeguir = [seleccion.length > 0, !!barbero, !!hora, nombre.trim().length > 1 && tel.trim().length > 6][paso];

  return (
    <section id="turnos" style={{ paddingBlock: "var(--section-y)", position: "relative", overflow: "hidden" }}>
      {/* El arte de marca detrás del asistente, tenue como en la sala del
         panel: las tarjetas sólidas del wizard y la cola mandan encima. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "url(assets/banner2.jpeg) center/cover", opacity: .12 }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 420px at 78% 12%, rgba(15,107,180,.20), transparent 68%)" }} />
      <div className="u-container" style={{ position: "relative", display: "grid", gap: "var(--sp-10)" }}>
        <SectionHeading kicker="Asignación automática de turnos" title="Pide tu turno en 30 segundos" description="Combina los servicios que quieras — solo un corte por turno — y el sistema te da el hueco más cercano." align="center" />

        <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: "var(--sp-6)", alignItems: "start" }}>
          <Card padding="var(--card-pad-lg)" accent="azul" style={{ display: "grid", gap: "var(--sp-6)", minHeight: 470, alignContent: "start" }}>
            {paso < 4 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-4)", flexWrap: "wrap" }}>
                <StepIndicator steps={pasos} current={paso} />
                <Button size="sm" variant="ghost" onClick={asignarAutomatico} iconLeft={<Icon name="zap" size={15} />}>Asignar por mí</Button>
              </div>
            )}

            {paso === 0 && (
              <div style={{ display: "grid", gap: "var(--sp-5)" }}>
                <span style={{ font: "600 var(--fs-2xs)/1.4 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--text-muted)" }}>¿Qué te vas a hacer? · Puedes elegir varios — solo un corte</span>
                {grupos.map(g => (
                  <div key={g.titulo} style={{ display: "grid", gap: "var(--sp-3)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, font: "700 var(--fs-xs)/1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--naranja-500)" }}>
                      <Icon name={g.icon} size={15} />{g.titulo}
                      <span style={{ flex: 1, height: 1, background: "var(--border-hair)" }} />
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
                      {g.items.map(s => (
                        <ChipServicio key={s.nombre} s={s} selected={seleccion.some(x => x.nombre === s.nombre)} onClick={() => alternar(s)} />
                      ))}
                    </div>
                  </div>
                ))}
                {seleccion.length > 0 && (
                  <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center", flexWrap: "wrap", padding: "var(--sp-3) var(--sp-4)", background: "var(--surface-raised)", border: "1px solid var(--border-blue)", borderRadius: "var(--radius-sm)" }}>
                    <span style={{ font: "700 var(--fs-sm)/1.3 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wide)", color: "var(--text-strong)", flex: 1, minWidth: 180 }}>{nombresSel}</span>
                    <span style={{ font: "700 var(--fs-lg)/1 var(--font-condensed)", color: "var(--naranja-500)" }}>{fmtPrecio(totalPrecio)}</span>
                    <span style={{ font: "600 var(--fs-2xs)/1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--text-faint)" }}>{fmtDur(totalMin)}</span>
                  </div>
                )}
                {avisoTope && <Badge tone="ocupado" dot>Máximo 3 horas por reserva web — para un combo mayor escríbenos por WhatsApp</Badge>}
              </div>
            )}

            {paso === 1 && (
              <div style={{ display: "grid", gap: "var(--sp-3)" }}>
                <span style={{ font: "600 var(--fs-2xs)/1.4 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--text-muted)" }}>{haySpa && haySilla ? "¿Quién te recibe? El equipo se coordina para el resto de servicios" : "¿Con quién?"}</span>
                {equipo.map(p => {
                  const vivo = estadoVivo(p);
                  return (
                    <BarberCard key={p.nombre} name={p.nombre} role={p.rol} estado={vivo.estado} nextSlot={vivo.proximo} specialty={p.especialidad}
                      selected={barbero === p.nombre} onClick={() => { setBarbero(p.nombre); setHora(null); }} />
                  );
                })}
              </div>
            )}

            {paso === 2 && (
              <div style={{ display: "grid", gap: "var(--sp-5)" }}>
                <div style={{ display: "grid", gap: "var(--sp-3)" }}>
                  <span style={{ font: "600 var(--fs-2xs)/1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--text-muted)" }}>Día</span>
                  <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                    {dias.map(d => <OptionChip key={d.key} accent="azul" selected={dia === d.key} onClick={() => { setDia(d.key); setHora(null); }}>{d.etiqueta}</OptionChip>)}
                  </div>
                </div>
                <SlotPicker jornadas={jornadas} value={hora} onChange={setHora} />
                {!jornadas[0].slots.length && <span style={{ font: "var(--fw-regular) var(--fs-sm)/1.5 var(--font-body)", color: "var(--text-muted)" }}>Por hoy ya no quedan horas — elige otro día.</span>}
                {totalVigente > 45 && <span style={{ font: "var(--fw-regular) var(--fs-2xs)/1.5 var(--font-body)", color: "var(--text-faint)" }}>Con {barbero} tus servicios suman {fmtDur(totalVigente)}: la hora elegida es la de inicio.</span>}
              </div>
            )}

            {paso === 3 && (
              <div style={{ display: "grid", gap: "var(--sp-4)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
                  <Input label="Tu nombre" placeholder="Como te llaman" value={nombre} onChange={e => setNombre(e.target.value)} icon={<Icon name="user-round" size={16} />} />
                  <Input label="WhatsApp" placeholder="300 000 0000" value={tel} onChange={e => setTel(e.target.value)} icon={<Icon name="phone" size={16} />} hint="Ahí te llega la confirmación" />
                </div>
                {auto && <Badge tone="azul" dot>Turno asignado automáticamente: el hueco más cercano</Badge>}
                <div style={{ display: "grid", gap: "var(--sp-2)", background: "var(--surface-raised)", border: "1px solid var(--border-hair)", borderRadius: "var(--radius-sm)", padding: "var(--sp-4)" }}>
                  {[["Servicios", nombresSel], ["Total", fmtPrecio(totalPrecio) + " · " + fmtDur(totalVigente)], ["Barbero", barbero], ["Día", (dias.find(d => d.key === dia) || {}).largo], ["Hora", hora]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-4)" }}>
                      <span style={{ font: "600 var(--fs-2xs)/1.5 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--text-faint)", flex: "0 0 auto" }}>{k}</span>
                      <span style={{ font: "700 var(--fs-sm)/1.5 var(--font-condensed)", textTransform: "uppercase", color: "var(--text-strong)", textAlign: "right" }}>{v || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {paso === 4 && turno && (
              <div style={{ display: "grid", gap: "var(--sp-5)", justifyItems: "center", textAlign: "center" }}>
                <Badge tone="libre" dot>Turno confirmado</Badge>
                <TurnoTicket {...turno} />
                <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", justifyContent: "center" }}>
                  <Button variant="secondary" as="a" target="_blank" rel="noopener"
                    href={"https://wa.me/" + D.telefono + "?text=" + encodeURIComponent(
                      "Hola, soy " + nombre + ". Pedí un turno en la página:\n" +
                      "Código: " + turno.codigo + "\n" +
                      "Servicios: " + turno.servicio + "\n" +
                      "Total: " + fmtPrecio(totalPrecio) + " · " + fmtDur(totalVigente) + "\n" +
                      "Con: " + turno.barbero + "\n" +
                      "Día: " + turno.fecha + "\n" +
                      "Hora: " + turno.hora + "\n" +
                      "Mi celular: " + tel)}
                    iconLeft={<Icon name="message-circle" size={16} />}>Enviar por WhatsApp</Button>
                  <Button variant="ghost" onClick={() => { setPaso(0); setTurno(null); setSeleccion([]); setBarbero(null); setHora(null); setAuto(false); }}>Pedir otro</Button>
                </div>
              </div>
            )}

            {paso < 4 && (
              <div style={{ display: "grid", gap: "var(--sp-3)", marginTop: "auto", paddingTop: "var(--sp-2)" }}>
                {errorReserva && <Badge tone="ocupado" dot>{errorReserva}</Badge>}
                <div style={{ display: "flex", gap: "var(--sp-3)" }}>
                  {paso > 0 && <Button variant="outline" onClick={() => { setErrorReserva(null); setPaso(p => p - 1); }}>Atrás</Button>}
                  {paso < 3
                    ? <Button disabled={!puedeSeguir} onClick={() => setPaso(p => p + 1)} iconRight={<Icon name="arrow-right" size={16} />}>Continuar</Button>
                    : <Button disabled={!puedeSeguir || reservando} onClick={confirmar} iconRight={<Icon name="check" size={16} />}>{reservando ? "Reservando…" : "Confirmar turno"}</Button>}
                </div>
              </div>
            )}
          </Card>

          <div style={{ display: "grid", gap: "var(--sp-4)" }}>
            {(() => {
              /* La tarjeta lateral pinta la cola REAL del día (cola_publica).
                 La espera estimada es la del que llega YA: minutos hasta el
                 primer hueco libre de CUALQUIERA del equipo. No se suman las
                 duraciones de la fila — los barberos atienden en paralelo y un
                 turno agendado para las 6pm no es gente esperando ahora (esa
                 suma llegó a decir "345 min" con dos turnos agendados). */
              const enSilla = colaViva.find(t => t.estado === "silla" || t.estado === "pausado");
              const esperas = colaViva.filter(t => t.estado === "espera");
              const H = D.horario || { apertura: 12, fin: 21 };
              const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();
              const abierto = ahoraMin >= H.apertura * 60 && ahoraMin < H.fin * 60;
              let est = null;
              if (abierto) {
                for (const p of D.equipo) {
                  const js = construirJornadas(dias[0].key, p.nombre, colaViva, 45);
                  const libre = js[0].slots.find(s => !s.tomado);
                  if (!libre) continue;
                  const m = libre.hora === "Ahora" ? 0 : Math.max(0, aMin911(libre.hora) - ahoraMin);
                  if (est === null || m < est) est = m;
                }
              }
              return <QueueStatus enAtencion={enSilla ? enSilla.codigo : "Sin turno en silla"} esperaMin={est}
                enEspera={esperas.slice(0, 4).map(t => ({ codigo: t.codigo, servicio: t.servicios }))} />;
            })()}
            {(() => {
              const items = [["zap", "El sistema busca el primer hueco libre del barbero que elijas."], ["layers", "¿Varios servicios? Se agendan seguidos en el mismo turno; solo un corte por visita."], ["ticket", "Te asigna un código de turno y te lo manda por WhatsApp."], ["clock", "Llega 5 minutos antes: el turno se libera a los 10."]];
              const filas = items.map(([ic, t]) => (
                <div key={t} style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", marginTop: 10 }}>
                  <span style={{ color: "var(--naranja-500)", marginTop: 2 }}><Icon name={ic} size={16} /></span>
                  <span style={{ font: "var(--type-small)", color: "var(--text-muted)" }}>{t}</span>
                </div>
              ));
              return movil
                ? <Plegable titulo="Cómo funciona" extra={<span style={{ color: "var(--naranja-500)", display: "grid" }}><Icon name="zap" size={16} /></span>}>{filas}</Plegable>
                : <Card padding="var(--card-pad)" style={{ display: "grid", gap: "var(--sp-1)" }}><span className="u-kicker">Cómo funciona</span>{filas}</Card>;
            })()}
          </div>
        </div>
      </div>
    </section>
  );
}

/* Foto del corte: URL completa (subida desde /admin a Storage) o asset local. */
const imgServicio = im => /^https?:/.test(im || "") ? im : "assets/servicios/" + im + ".jpeg";

function Cortes({ onPedir }) {
  const D = window.DATA_911;
  const { SectionHeading, ServiceCard } = window.Ds911UrbanSalNDesignSystem_1e06a9;
  const movil = useMovil();
  const visibles = D.cortes.filter(c => c.estado !== "borrador");
  return (
    <section id="cortes" style={{ paddingBlock: "var(--section-y)", background: "var(--negro-950)", borderBlock: "1px solid var(--border-hair)" }}>
      <div className="u-container" style={{ display: "grid", gap: "var(--sp-10)" }}>
        <SectionHeading kicker="Estilos de corte" title="Los cortes que dominamos" description="Cada uno con su tiempo real de silla, para que el turno que te asignamos sea el que de verdad necesitas." />
        {movil && <PistaDesliza />}
        {movil ? (
          <Carrusel ancho="78%">
            {visibles.map(c => {
              const agotado = c.estado === "agotado";
              return (
                <div key={c.nombre} style={{ display: "grid", opacity: agotado ? .55 : 1, pointerEvents: agotado ? "none" : "auto" }}>
                  <ServiceCard image={imgServicio(c.img)} title={c.nombre} description={c.desc} price={c.precio} duration={c.dur} badge={agotado ? "No disponible" : c.badge} onClick={agotado ? undefined : () => onPedir(c.nombre)} />
                </div>
              );
            })}
          </Carrusel>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--sp-4)" }}>
          {visibles.map((c, i) => {
            const agotado = c.estado === "agotado";
            return (
              <div key={c.nombre} data-aos="fade-up" data-aos-delay={i * 80} style={{ display: "grid", opacity: agotado ? .55 : 1, pointerEvents: agotado ? "none" : "auto" }}>
                <ServiceCard image={imgServicio(c.img)} title={c.nombre} description={c.desc} price={c.precio} duration={c.dur} badge={agotado ? "No disponible" : c.badge} onClick={agotado ? undefined : () => onPedir(c.nombre)} />
              </div>
            );
          })}
        </div>
        )}
      </div>
    </section>
  );
}

function Spa() {
  const D = window.DATA_911;
  const { SectionHeading, Card, Badge, Icon } = window.Ds911UrbanSalNDesignSystem_1e06a9;
  const movil = useMovil();
  const visibles = D.spa.filter(s => s.estado !== "borrador");
  return (
    <section id="spa" style={{ paddingBlock: "var(--section-y)" }}>
      <div className="u-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-12)", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "var(--sp-6)" }} data-aos="fade-right">
          <SectionHeading kicker="Spa y masajes" title="Massoterapia" description="Conjunto de técnicas para tratamiento terapéutico, alivio de dolores, estrés y bienestar en general." tag="Bienestar es equilibrio" />
          <div style={{ display: "grid", gap: "var(--sp-3)" }}>
            {visibles.map(s => {
              const agotado = s.estado === "agotado";
              return (
                <Card key={s.nombre} padding="var(--sp-4)" style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center", opacity: agotado ? .55 : 1 }}>
                  <span style={{ width: 40, height: 40, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: "var(--radius-sm)", background: "var(--surface-blue-soft)", color: "var(--azul-neon)" }}><Icon name={s.icon} size={20} /></span>
                  <div style={{ display: "grid", gap: 2, flex: 1 }}>
                    <span style={{ font: "700 var(--fs-lg)/1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wide)", color: "var(--text-strong)" }}>{s.nombre}</span>
                    <span style={{ font: "var(--type-small)", color: "var(--text-muted)" }}>{s.desc}</span>
                  </div>
                  {agotado
                    ? <Badge tone="ocupado">No disponible</Badge>
                    : <div style={{ textAlign: "right" }}>
                        <div style={{ font: "700 var(--fs-lg)/1 var(--font-condensed)", color: "var(--naranja-500)" }}>{s.precio}</div>
                        <div style={{ font: "600 var(--fs-3xs)/1.6 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--text-faint)" }}>{s.dur}</div>
                      </div>}
                </Card>
              );
            })}
          </div>
        </div>
        {movil ? (
          <Plegable titulo="Limpieza facial: los siete pasos" extra={<span style={{ color: "var(--azul-neon)", display: "grid" }}><Icon name="sparkles" size={18} /></span>}>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--sp-3)" }}>
              {D.facial.map((p, i) => (
                <li key={p} style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center" }}>
                  <span style={{ font: "400 var(--fs-lg)/1 var(--font-display)", color: "var(--azul-neon)", width: 28 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ font: "var(--type-small)", color: "var(--text-body)" }}>{p}</span>
                </li>
              ))}
            </ol>
          </Plegable>
        ) : (
        <Card padding="var(--card-pad-lg)" accent="azul" data-aos="fade-left" style={{ display: "grid", gap: "var(--sp-5)" }}>
          <div style={{ display: "grid", gap: "var(--sp-2)" }}>
            <span className="u-kicker">Limpieza facial para hombres</span>
            <h3 style={{ margin: 0, font: "400 var(--fs-3xl)/1 var(--font-display)", textTransform: "uppercase", color: "var(--text-strong)" }}>Siete pasos</h3>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--sp-3)" }}>
            {D.facial.map((p, i) => (
              <li key={p} style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center", paddingBottom: "var(--sp-3)", borderBottom: i < D.facial.length - 1 ? "1px solid var(--border-hair)" : "none" }}>
                <span style={{ font: "400 var(--fs-xl)/1 var(--font-display)", color: "var(--azul-neon)", width: 30 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ font: "var(--type-body)", color: "var(--text-body)" }}>{p}</span>
              </li>
            ))}
          </ol>
        </Card>
        )}
      </div>
    </section>
  );
}

function Horarios() {
  const H = window.DATA_911.horario || {};
  const movil = useMovil();
  const { SectionHeading, Card, Badge, Icon } = window.Ds911UrbanSalNDesignSystem_1e06a9;
  return (
    <section id="horarios" style={{ paddingBlock: "var(--section-y)", background: "var(--negro-950)", borderBlock: "1px solid var(--border-hair)" }}>
      <div className="u-container" style={{ display: "grid", gridTemplateColumns: ".9fr 1.1fr", gap: "var(--sp-12)", alignItems: "center" }}>
        <div style={{ position: "relative", display: "grid", placeItems: "center", minHeight: movil ? 0 : 300 }} data-aos="fade-right">
          <img src="assets/icon-barber-pole.png" alt="" style={{ height: movil ? 150 : 300, filter: "drop-shadow(0 0 40px rgba(46,155,240,.35))" }} />
        </div>
        <div style={{ display: "grid", gap: "var(--sp-6)" }} data-aos="fade-left">
          <SectionHeading kicker="Horarios" title={H.dias || "De miércoles a lunes"} />
          <div style={{ display: "grid", gap: "var(--sp-4)", justifyItems: "start" }}>
            <Card padding="var(--card-pad)" style={{ display: "grid", gap: "var(--sp-3)", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name="clock" size={18} color="var(--naranja-500)" />
                <span style={{ font: "700 var(--fs-lg)/1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wider)", color: "var(--text-strong)" }}>Horario de atención</span>
              </div>
              <div style={{ font: "400 var(--fs-3xl)/1 var(--font-display)", color: "var(--text-strong)" }}>{H.etiqueta || "12:00 p.m — 9:00 p.m"}</div>
              <span style={{ font: "var(--type-small)", color: "var(--text-muted)" }}>{H.nota || "Barberos y masajistas en jornada continua."}</span>
            </Card>
            <Badge tone="ocupado">{H.cierre || "Martes cerrado"}</Badge>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const D = window.DATA_911;
  const H = D.horario || {};
  const { Icon } = window.Ds911UrbanSalNDesignSystem_1e06a9;
  return (
    <footer style={{ borderTop: "1px solid var(--border-hair)", background: "var(--negro-950)", paddingBlock: "var(--sp-12)" }}>
      <div className="u-container" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "var(--sp-10)" }}>
        <div style={{ display: "grid", gap: "var(--sp-4)", justifyItems: "start" }}>
          {(D.imagenes || {}).logo
            ? <img src={D.imagenes.logo} alt="911 Urban Salón" style={{ height: 110 }} />
            : <LogoMarca alto={110} tagline />}
          <span style={{ fontFamily: "var(--font-tag)", color: "var(--naranja-500)", transform: "rotate(-2deg)", display: "inline-block" }}>Tu belleza, nuestra emergencia</span>
        </div>
        <div style={{ display: "grid", gap: "var(--sp-3)", alignContent: "start" }}>
          <h4 style={{ font: "700 var(--fs-sm)/1 var(--font-condensed)", letterSpacing: "var(--ls-wider)", color: "var(--text-strong)", margin: 0 }}>Horarios</h4>
          <span style={{ font: "var(--type-small)", color: "var(--text-muted)" }}>{H.dias || "De miércoles a lunes"}<br />{H.etiqueta || "12:00 p.m — 9:00 p.m"}<br />{H.cierre || "Martes cerrado"}</span>
        </div>
        <div style={{ display: "grid", gap: "var(--sp-3)", alignContent: "start" }}>
          <h4 style={{ font: "700 var(--fs-sm)/1 var(--font-condensed)", letterSpacing: "var(--ls-wider)", color: "var(--text-strong)", margin: 0 }}>Contacto</h4>
          <a href={"https://wa.me/" + D.telefono} style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-small)" }}><Icon name="message-circle" size={16} />WhatsApp</a>
          {/* Lucide 1.x retiró los iconos de marcas: el glifo de Instagram va inline. */}
          <a href="#" style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-small)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
            @911urbansalon</a>
          {/* Ruta en Google Maps desde la ubicación del visitante: sin origen,
              Maps usa "tu ubicación". El destino sale de D.direccion, así que
              editar la dirección en /admin también corrige el enlace. */}
          <a href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(D.direccion)} target="_blank" rel="noreferrer" title="Cómo llegar (Google Maps)"
            style={{ display: "flex", gap: 8, alignItems: "flex-start", font: "var(--type-small)" }}><Icon name="map-pin" size={16} />{D.direccion}</a>
        </div>
      </div>
      <div className="u-container" style={{ marginTop: "var(--sp-8)", paddingTop: "var(--sp-5)", borderTop: "1px solid var(--border-hair)", font: "var(--fw-regular) var(--fs-2xs)/1.5 var(--font-body)", color: "var(--text-faint)", display: "flex", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
        <span>911 Urban Salón · {new Date().getFullYear()}</span>
        <span style={{ textTransform: "uppercase", letterSpacing: "var(--ls-widest)" }}>Ynt-labs</span>
      </div>
    </footer>
  );
}

function Servicios() {
  const D = window.DATA_911;
  const { SectionHeading, Card, Icon } = window.Ds911UrbanSalNDesignSystem_1e06a9;
  const movil = useMovil();
  const tarjeta = (c, i, aos) => (
    <Card key={c.titulo} interactive padding="var(--card-pad)" {...(aos ? { "data-aos": "fade-up", "data-aos-delay": i * 80 } : {})} style={{ display: "grid", gap: "var(--sp-3)", alignContent: "start" }}>
      <span style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: "var(--radius-sm)", background: "var(--surface-accent-soft)", color: "var(--naranja-500)" }}><Icon name={c.icon} size={22} /></span>
      <h3 style={{ margin: 0, font: "700 var(--fs-lg)/1.1 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wide)", color: "var(--text-strong)" }}>{c.titulo}</h3>
      <p style={{ margin: 0, font: "var(--type-small)", color: "var(--text-muted)" }}>{c.texto}</p>
    </Card>
  );
  return (
    <section id="servicios" style={{ paddingBlock: "var(--section-y)" }}>
      <div className="u-container" style={{ display: "grid", gap: movil ? "var(--sp-5)" : "var(--sp-10)" }}>
        <SectionHeading kicker="Carta" title="Cuatro frentes, un mismo estándar" description="Lo que hacemos en silla y lo que hacemos en camilla." align="center" />
        {movil
          ? <React.Fragment><PistaDesliza /><Carrusel ancho="70%">{D.categorias.map((c, i) => tarjeta(c, i, false))}</Carrusel></React.Fragment>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--sp-4)" }}>{D.categorias.map((c, i) => tarjeta(c, i, true))}</div>}
      </div>
    </section>
  );
}

function ComoFunciona() {
  const D = window.DATA_911;
  const { SectionHeading, Card } = window.Ds911UrbanSalNDesignSystem_1e06a9;
  const movil = useMovil();
  return (
    <section id="flujo" style={{ paddingBlock: "var(--section-y)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "url('assets/texture-graffiti-black.jpeg') center/cover", opacity: .18 }} />
      <div className="u-container" style={{ position: "relative", display: "grid", gap: movil ? "var(--sp-5)" : "var(--sp-10)" }}>
        <SectionHeading kicker="Flujograma de atención" title="Cómo te atendemos" description="El mismo recorrido para todos, desde que entras hasta que te vas." align="center" />
        {movil ? (
          <div style={{ display: "grid", gap: "var(--sp-2)" }}>
            {D.flujo.map((p, i) => (
              <Plegable key={p.n} abierto={i === 0} titulo={p.t}
                extra={<span style={{ font: "400 var(--fs-2xl)/1 var(--font-display)", color: "var(--naranja-500)", width: 26, flex: "0 0 auto" }}>{p.n}</span>}>
                <p style={{ margin: 0, font: "var(--type-small)", color: "var(--text-muted)" }}>{p.d}</p>
              </Plegable>
            ))}
            <div style={{ textAlign: "center", paddingTop: "var(--sp-3)" }}>
              <span style={{ fontFamily: "var(--font-tag)", fontSize: "var(--fs-lg)", color: "var(--naranja-500)", transform: "rotate(-3deg)", display: "inline-block" }}>¡Tu belleza, nuestra emergencia!</span>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--sp-4)" }}>
            {D.flujo.map((p, i) => (
              <Card key={p.n} padding="var(--sp-5)" data-aos="fade-up" data-aos-delay={i * 60} style={{ display: "grid", gap: "var(--sp-2)", alignContent: "start" }}>
                <span style={{ font: "400 var(--fs-4xl)/1 var(--font-display)", color: "var(--naranja-500)", opacity: .9 }}>{p.n}</span>
                <h3 style={{ margin: 0, font: "700 var(--fs-base)/1.15 var(--font-condensed)", textTransform: "uppercase", letterSpacing: "var(--ls-wide)", color: "var(--text-strong)" }}>{p.t}</h3>
                <p style={{ margin: 0, font: "var(--type-small)", color: "var(--text-muted)" }}>{p.d}</p>
              </Card>
            ))}
            <Card padding="var(--sp-5)" accent="azul" selected style={{ display: "grid", gap: "var(--sp-2)", alignContent: "center" }}>
              <span style={{ fontFamily: "var(--font-tag)", fontSize: "var(--fs-xl)", color: "var(--naranja-500)", transform: "rotate(-3deg)", display: "inline-block" }}>¡Tu belleza,<br />nuestra emergencia!</span>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}

function Resenas() {
  const D = window.DATA_911;
  const { SectionHeading, ReviewCard } = window.Ds911UrbanSalNDesignSystem_1e06a9;
  const movil = useMovil();
  return (
    <section style={{ paddingBlock: "var(--section-y)" }}>
      <div className="u-container" style={{ display: "grid", gap: movil ? "var(--sp-5)" : "var(--sp-10)" }}>
        <SectionHeading kicker="Lo que dicen" title="Reseñas de la silla" align="center" />
        {movil
          ? <React.Fragment><PistaDesliza /><Carrusel ancho="82%">{D.resenas.map(r => <ReviewCard key={r.a} quote={r.q} author={r.a} meta={r.m} />)}</Carrusel></React.Fragment>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--sp-4)" }}>
              {D.resenas.map((r, i) => <div key={r.a} data-aos="fade-up" data-aos-delay={i * 80}><ReviewCard quote={r.q} author={r.a} meta={r.m} /></div>)}
            </div>}
      </div>
    </section>
  );
}

Object.assign(window, { TurnosAsistente, Servicios, Cortes, Spa, ComoFunciona, Resenas, Horarios, Footer });
})();



/* ══ Montaje (antes segundo <script> de la página) ══ */


/* ── Logo vectorial de la marca ──
   Tipográfico, con las variables del tema activo: el "911" y el "SALÖN" van
   en el acento, así que combina solo con los 5 estilos (y con el serif del
   Clásico, porque hereda --font-display). Reemplaza al viejo recorte de foto. */
function LogoMarca({ alto = 96, tagline = false }) {
  const alto2 = tagline ? 150 : 128;
  return (
    <svg viewBox={"0 0 340 " + alto2} height={alto} aria-label="911 Urban Salón" role="img"
      style={{ display: "block", overflow: "visible" }}>
      {/* corona del lockup original */}
      <path d="M148 14 l7 -10 7 6 8 -9 8 9 7 -6 7 10 -22 4 z" fill="var(--blanco)" opacity=".92" transform="rotate(-4 170 10)" />
      <text x="170" y="56" textAnchor="middle" fill="var(--naranja-500)" stroke="var(--negro-950)" strokeWidth="1"
        style={{ font: "400 52px var(--font-display)", letterSpacing: "2px" }} transform="rotate(-2 170 40)">911</text>
      <text x="170" y="97" textAnchor="middle" fill="var(--blanco)"
        style={{ font: "400 36px var(--font-display)", letterSpacing: "8px" }}>URBAN</text>
      <text x="170" y="124" textAnchor="middle" fill="var(--naranja-500)"
        style={{ font: "400 21px var(--font-display)", letterSpacing: "12px" }} transform="rotate(-1.5 170 116)">SALÖN</text>
      {tagline && <text x="170" y="146" textAnchor="middle" fill="var(--text-muted)"
        style={{ font: "600 10.5px var(--font-condensed)", letterSpacing: "3px", textTransform: "uppercase" }}>Tu belleza, nuestra emergencia</text>}
    </svg>
  );
}

/* Versión horizontal compacta para la barra de navegación. */
function LogoMarcaBarra() {
  return (
    <svg viewBox="0 0 250 40" height="34" aria-label="911 Urban Salón" role="img" style={{ display: "block", overflow: "visible" }}>
      <path d="M6 9 l5 -7 5 4 5 -6 5 6 5 -4 5 7 -15 3 z" fill="var(--blanco)" opacity=".9" transform="rotate(-4 21 6)" />
      <text x="4" y="33" fill="var(--naranja-500)" style={{ font: "400 30px var(--font-display)", letterSpacing: "1px" }} transform="rotate(-2 20 24)">911</text>
      <text x="66" y="33" fill="var(--blanco)" style={{ font: "400 24px var(--font-display)", letterSpacing: "3px" }}>URBAN</text>
      <text x="172" y="33" fill="var(--naranja-500)" style={{ font: "400 24px var(--font-display)", letterSpacing: "3px" }}>SALÖN</text>
    </svg>
  );
}

/* Barra de navegación propia (reemplaza la del bundle): el logo vectorial
   en vez de la foto recortada, mismos anclajes y CTA. */
function NavBar({ onCta }) {
  const { Button, Icon } = window.Ds911UrbanSalNDesignSystem_1e06a9;
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(5,5,6,.82)", backdropFilter: "blur(10px)",
      borderBottom: "1px solid var(--border-hair)" }}>
      <div className="u-container" style={{ display: "flex", alignItems: "center", gap: "var(--sp-6)", minHeight: 64 }}>
        <a href="#top" aria-label="Inicio"><LogoMarcaBarra /></a>
        <nav style={{ display: "flex", gap: "var(--sp-5)", marginLeft: "auto" }}>
          {[["#cortes", "Cortes"], ["#spa", "Spa"], ["#turnos", "Turnos"], ["#equipo", "Equipo"], ["#horarios", "Horarios"]].map(([href, t]) => (
            <a key={href} href={href} style={{ font: "600 var(--fs-2xs)/1 var(--font-condensed)", textTransform: "uppercase",
              letterSpacing: "var(--ls-wider)", color: "var(--text-muted)" }}>{t}</a>
          ))}
        </nav>
        <Button size="sm" onClick={onCta} iconLeft={<Icon name="calendar-clock" size={15} />}
          style={{ marginLeft: "var(--sp-2)" }}>Pedir turno</Button>
      </div>
    </header>
  );
}

/* Banda de marca vectorial: las diagonales naranja/azul y las salpicaduras
   del arte original, en plano — nunca se recorta feo, pesa nada y se tiñe
   con el tema. Si en Ajustes se sube un banner propio, ese manda. */
function BannerMarca(){
  const im = (window.DATA_911.imagenes || {});
  /* Orden de la banda: 1) banner subido en Ajustes, 2) el mural del repo
     (assets/banner.jpeg), 3) la composición vectorial si no hay ninguno —
     onError hace la caída sola, así un clon white-label sin arte no rompe. */
  const [sinArchivo, setSinArchivo] = React.useState(false);
  const src = im.banner || (!sinArchivo ? "assets/banner.jpeg" : null);
  if (src) {
    return (
      <div aria-hidden="true" style={{borderBlock:"1px solid var(--border-hair)",background:"var(--negro-950)"}}>
        <img src={src} alt="" onError={() => setSinArchivo(true)}
          style={{display:"block",width:"100%",height:"clamp(150px, 24vw, 330px)",objectFit:"cover",objectPosition:"center 42%"}}/>
      </div>
    );
  }
  const puntos = [[70,40,5],[130,190,4],[300,60,6],[420,205,5],[560,35,4],[905,200,5],[1010,50,6],[1105,180,4],[220,120,3],[990,130,3]];
  return (
    <div aria-hidden="true" style={{borderBlock:"1px solid var(--border-hair)",background:"var(--negro-950)"}}>
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMid slice"
        style={{ display: "block", width: "100%", height: "clamp(140px, 20vw, 280px)" }}>
        <rect width="1200" height="240" fill="var(--negro-950)" />
        {/* brochazos diagonales, como el arte de muestra */}
        <polygon points="0,240 170,0 330,0 90,240" fill="var(--naranja-600)" opacity=".85" />
        <polygon points="60,240 250,0 300,0 120,240" fill="var(--azul-500)" opacity=".8" />
        <polygon points="1200,0 1030,240 880,240 1110,0" fill="var(--azul-600)" opacity=".8" />
        <polygon points="1160,0 990,240 940,240 1105,0" fill="var(--naranja-500)" opacity=".75" />
        <polygon points="330,240 420,120 450,150 380,240" fill="var(--naranja-500)" opacity=".25" />
        <polygon points="800,0 760,70 730,40 770,0" fill="var(--azul-400)" opacity=".3" />
        {/* salpicaduras y rayones */}
        {puntos.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? "var(--naranja-400)" : "var(--azul-300)"} opacity=".55" />)}
        <path d="M1070 40 l60 90 M1100 30 l50 80 M60 190 l70 -90" stroke="var(--blanco)" strokeWidth="4" opacity=".28" strokeLinecap="round" />
        {/* lockup centrado */}
        <path d="M578 28 l7 -10 7 6 8 -9 8 9 7 -6 7 10 -22 4 z" fill="var(--blanco)" opacity=".92" />
        <text x="600" y="92" textAnchor="middle" fill="var(--naranja-500)" stroke="var(--negro-950)" strokeWidth="1.2"
          style={{ font: "400 58px var(--font-display)", letterSpacing: "2px" }} transform="rotate(-2 600 70)">911</text>
        <text x="600" y="150" textAnchor="middle" fill="var(--blanco)"
          style={{ font: "400 46px var(--font-display)", letterSpacing: "12px" }}>URBAN</text>
        <text x="600" y="192" textAnchor="middle" fill="var(--naranja-500)"
          style={{ font: "400 27px var(--font-display)", letterSpacing: "16px" }} transform="rotate(-1.5 600 184)">SALÖN</text>
        <text x="600" y="216" textAnchor="middle" fill="var(--gris-200)"
          style={{ font: "600 12px var(--font-condensed)", letterSpacing: "4px", textTransform: "uppercase" }}>TU BELLEZA · NUESTRA EMERGENCIA</text>
      </svg>
    </div>
  );
}

/* Selector de estilo: 4 identidades de acento a gusto del visitante. La
   elección vive en localStorage y el CSS de :root[data-tema] hace el resto. */
const TEMAS_911=[
  {id:"",nombre:"911 Urbano · naranja",color:"#F07A28"},
  {id:"azul",nombre:"Acero · azul",color:"#5578BE"},
  {id:"rojo",nombre:"Vandal · rojo 911",color:"#C6403E"},
  {id:"platino",nombre:"Platino · blanco",color:"#E6E6EC"},
  {id:"clasico",nombre:"Clásico · arena",color:"#AD987D"}
];
/* Cada estilo tiene su tipografía de titulares; la fuente se baja SOLO cuando
   el visitante elige ese estilo (Permanent Marker ya viene con la página). */
const FUENTES_TEMA={ azul:"Archivo+Black", platino:"Oswald:wght@500", clasico:"Playfair+Display:ital,wght@0,500;0,600;1,500" };
function cargarFuenteTema(id){
  const f=FUENTES_TEMA[id];
  if(!f||document.getElementById("fnt-"+id))return;
  const l=document.createElement("link");
  l.id="fnt-"+id; l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family="+f+"&display=swap";
  document.head.appendChild(l);
}
function SelectorTema(){
  const [tema,setTema]=React.useState(()=>{try{return localStorage.getItem("tema911")||"";}catch(e){return "";}});
  React.useEffect(()=>{cargarFuenteTema(tema);},[]); // el tema persistido trae su fuente
  const aplicar=id=>{
    setTema(id);
    cargarFuenteTema(id);
    document.documentElement.dataset.tema=id;
    try{localStorage.setItem("tema911",id);}catch(e){}
  };
  return (
    <div role="group" aria-label="Estilo de la página"
      style={{position:"fixed",left:14,bottom:16,zIndex:60,display:"flex",gap:9,alignItems:"center",
        padding:"9px 12px",background:"rgba(10,10,11,.88)",border:"1px solid var(--border-hair)",
        borderRadius:999,backdropFilter:"blur(6px)"}}>
      <span style={{font:"700 var(--fs-3xs)/1 var(--font-condensed)",textTransform:"uppercase",
        letterSpacing:"var(--ls-wider)",color:"var(--text-faint)"}}>Estilo</span>
      {TEMAS_911.map(t=>(
        <button key={t.id} type="button" title={t.nombre} aria-label={"Estilo "+t.nombre} aria-pressed={tema===t.id}
          onClick={()=>aplicar(t.id)}
          style={{width:18,height:18,borderRadius:"50%",cursor:"pointer",background:t.color,padding:0,
            border:"2px solid "+(tema===t.id?"var(--blanco)":"rgba(255,255,255,.25)"),
            transform:tema===t.id?"scale(1.15)":"none",transition:"transform .15s"}}/>
      ))}
    </div>
  );
}

function App(){
  const [servicioPedido,setServicioPedido]=React.useState(null);
  const [version,setVersion]=React.useState(0);
  React.useEffect(()=>{
    if(window.AOS) AOS.init({duration:520,easing:"ease-out-quart",once:true,offset:60});
    if(window.lucide) window.lucide.createIcons({nameAttr:"data-lucide"});
    /* Si el contenido de Supabase llega después del montaje, re-render. */
    window.__refrescar911=()=>setVersion(v=>v+1);
    return ()=>{ window.__refrescar911=null; };
  },[]);
  React.useEffect(()=>{
    if(version>0){
      if(window.lucide) window.lucide.createIcons({nameAttr:"data-lucide"});
      if(window.AOS) AOS.refreshHard();
    }
  },[version]);
  function irATurnos(servicio){
    if(servicio) setServicioPedido(servicio+"|"+Date.now());
    const el=document.getElementById("turnos");
    if(el) window.scrollTo({top:el.offsetTop-70,behavior:"smooth"});
  }
  const servicioInicial=servicioPedido?servicioPedido.split("|")[0]:null;
  return (<React.Fragment>
    <NavBar onCta={()=>irATurnos(null)}/>
    <Hero onCta={()=>irATurnos(null)}/>
    <BannerMarca/>
    <Servicios/>
    <Cortes onPedir={irATurnos}/>
    <Spa/>
    <TurnosAsistente servicioInicial={servicioInicial}/>
    <Equipo onPedir={irATurnos}/>
    <ComoFunciona/>
    <Horarios/>
    <Resenas/>
    <Faq onCta={()=>irATurnos(null)}/>
    <Footer/>
    <BarraWhatsApp/>
    <SelectorTema/>
  </React.Fragment>);
}
let intentos=0;
const iv=setInterval(()=>{
  intentos++;
  /* Espera hasta ~1.2s a que responda Supabase para pintar con contenido
     fresco de una vez; si tarda más, monta con el embebido y __refrescar911
     actualiza cuando llegue. */
  const datosListos=!window.__CONTENIDO_911||window.__CONTENIDO_911.listo||intentos>30;
  if(window.NavBar&&window.Servicios&&window.TurnosAsistente&&datosListos){
    clearInterval(iv);
    ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
  }else if(intentos>150){
    clearInterval(iv);
    document.getElementById("root").innerHTML='<div style="min-height:60vh;display:grid;place-items:center;text-align:center;padding:40px;font:var(--type-body);color:var(--text-muted)"><div><strong style="font:400 36px/1 var(--font-display);text-transform:uppercase;color:var(--text-strong);display:block;margin-bottom:12px">Error al montar la página</strong>Los componentes del design system no cargaron. Recarga la página.</div></div>';
  }
},40);

