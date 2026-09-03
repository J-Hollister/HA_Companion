/**
 * ha-companion-workout-card
 *
 * Historial de entrenamientos del reloj, hermana de ha-companion-sleep-card.
 *
 * Zepp OS solo da `startTime`, `duration` y (de propina) `sportType` por sesión:
 * no hay muestras de pulso, ni zonas, ni ritmo, ni distancia. Así que esto pinta
 * lo único que existe de verdad — cuándo y cuánto — y lo acompaña con los
 * agregados del reloj (carga, VO2 máx, recuperación).
 *
 * config:
 *   type: custom:ha-companion-workout-card
 *   entity: sensor.<algo>_recent_workouts        (obligatorio, atributo `workouts`)
 *   load_entity: sensor.<reloj>_carga_de_entrenamiento    (opcional)
 *   vo2_entity: sensor.<reloj>_vo2_max                    (opcional)
 *   recovery_entity: sensor.<reloj>_tiempo_de_recuperacion_total  (opcional)
 *   days: 7                                      (opcional, por defecto 7)
 *   title: Entrenamientos                        (opcional)
 */

const TAG = "ha-companion-workout-card";

// Un color por familia de deporte; el resto cae en el neutro.
const COLORES = [
  { re: /walk|hiking|trek/i,               color: "#5B8DEF" },
  { re: /run|jog|treadmill/i,              color: "#F0A030" },
  { re: /cycl|bike|riding/i,               color: "#34C77B" },
  { re: /swim|pool/i,                      color: "#22B8CF" },
  { re: /strength|gym|weight|training/i,   color: "#A78BFA" },
  { re: /yoga|pilates|stretch/i,           color: "#E86FA9" },
];
const NEUTRO = "#64748B";
const color = (deporte) =>
  (COLORES.find((c) => c.re.test(deporte || "")) || {}).color || NEUTRO;

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const ESTILOS = `
  :host { display: block; }
  ha-card { padding: 16px; }

  .cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .total { font-size: 30px; font-weight: 500; line-height: 1.1;
           color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .sub { color: var(--secondary-text-color); font-size: 14px; }

  .dias { display: grid; gap: 6px; margin: 16px 0 4px; }
  .dia { display: grid; grid-template-columns: 58px 1fr auto; align-items: center;
         gap: 10px; }
  .fecha { font-size: 12px; color: var(--secondary-text-color);
           font-variant-numeric: tabular-nums; white-space: nowrap; }
  .fecha b { color: var(--primary-text-color); font-weight: 500; }
  .pista { position: relative; height: 20px; border-radius: 4px;
           background: var(--divider-color); overflow: hidden; }
  .pista.hoy { outline: 1px solid var(--primary-color); outline-offset: 1px; }
  .sesion { position: absolute; top: 0; height: 100%; border-radius: 3px;
            transition: filter .12s; }
  .sesion:hover { filter: brightness(1.35); }
  .min { font-size: 12px; color: var(--secondary-text-color); min-width: 52px;
         text-align: right; white-space: nowrap;
         font-variant-numeric: tabular-nums; }
  .min.cero { opacity: .35; }

  .eje { display: grid; grid-template-columns: 58px 1fr auto; gap: 10px;
         margin-top: 4px; }
  .horas { grid-column: 2; position: relative; height: 13px; font-size: 10px;
           color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .horas span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
  .horas span:last-child { transform: translateX(-100%); }

  .pie { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 16px;
         padding-top: 13px; border-top: 1px solid var(--divider-color); }
  .dato { display: flex; flex-direction: column; gap: 1px; }
  .dato b { font-size: 18px; font-weight: 500; color: var(--primary-text-color);
            font-variant-numeric: tabular-nums; }
  .dato span { font-size: 11px; color: var(--secondary-text-color); }

  .leyenda { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px;
             font-size: 12px; color: var(--secondary-text-color); }
  .leyenda i { display: inline-block; width: 8px; height: 8px; border-radius: 2px;
               margin-right: 5px; vertical-align: middle; }

  .vacio { color: var(--secondary-text-color); font-size: 14px; }
  .error { color: var(--error-color, #db4437); font-size: 14px; }
`;

const dur = (min) => {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
};

class HaCompanionWorkoutCard extends HTMLElement {
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.endsWith("_recent_workouts"));
    return { type: "custom:" + TAG, entity: e || "" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Falta `entity`: el sensor de entrenamientos recientes");
    }
    this._config = config;
    this._pintado = null;
    // Igual que en la tarjeta del sueño: setConfig se llama más de una vez sobre
    // el mismo elemento y attachShadow por segunda vez lanza NotSupportedError.
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${ESTILOS}</style><ha-card></ha-card>`;
    }
    this._card = this.shadowRoot.querySelector("ha-card");
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config.entity];
    const huella = st ? `${st.state}|${st.last_updated}` : "sin-entidad";
    if (huella === this._pintado) return;
    this._pintado = huella;
    this._render();
  }

  getCardSize() { return 5; }

  _num(clave) {
    const id = this._config[clave];
    if (!id || !this._hass) return null;
    const st = this._hass.states[id];
    if (!st || isNaN(Number(st.state))) return null;
    return Number(st.state);
  }

  _render() {
    const c = this._card;
    c.innerHTML = "";
    if (this._config.title) c.setAttribute("header", this._config.title);

    const st = this._hass.states[this._config.entity];
    if (!st) {
      c.innerHTML = `<div class="error">No existe ${this._config.entity}</div>`;
      return;
    }

    const sesiones = (st.attributes.workouts || [])
      .filter((w) => w.start && w.duration_min > 0)
      .map((w) => ({ ...w, d: new Date(w.start) }))
      .filter((w) => !isNaN(w.d));

    if (!sesiones.length) {
      c.innerHTML = `<div class="vacio">Todavía no hay entrenamientos.</div>`;
      return;
    }

    const dias = Math.max(1, Number(this._config.days) || 7);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const clave = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };

    const enRango = sesiones.filter((w) => (hoy - clave(w.d)) / 86400000 < dias);
    const total = enRango.reduce((a, w) => a + w.duration_min, 0);

    // ---- cabecera -------------------------------------------------------
    const cab = document.createElement("div");
    cab.className = "cab";
    cab.innerHTML =
      `<span class="total">${dur(total)}</span>` +
      `<span class="sub">${enRango.length} ${enRango.length === 1 ? "sesión" : "sesiones"}` +
      ` en ${dias} días</span>`;
    c.appendChild(cab);

    // ---- una fila por día, la sesión colocada a su hora real -------------
    const cont = document.createElement("div");
    cont.className = "dias";

    for (let i = dias - 1; i >= 0; i--) {
      const dia = new Date(hoy); dia.setDate(dia.getDate() - i);
      const delDia = enRango.filter((w) => clave(w.d) === dia.getTime());
      const min = delDia.reduce((a, w) => a + w.duration_min, 0);

      const fila = document.createElement("div");
      fila.className = "dia";

      const f = document.createElement("div");
      f.className = "fecha";
      f.innerHTML = `${DIAS[dia.getDay()]} <b>${dia.getDate()}</b>`;

      const pista = document.createElement("div");
      pista.className = "pista" + (i === 0 ? " hoy" : "");
      delDia.forEach((w) => {
        const desde = w.d.getHours() * 60 + w.d.getMinutes();
        const s = document.createElement("div");
        s.className = "sesion";
        s.style.left = `${(desde / 1440) * 100}%`;
        // Con 15 min sobre 24 h el bloque sería de un pelo: le damos un mínimo.
        s.style.width = `${Math.max((w.duration_min / 1440) * 100, 1.6)}%`;
        s.style.background = color(w.sport);
        s.title = `${w.date} · ${w.sport} · ${w.duration_min} min`;
        pista.appendChild(s);
      });

      const m = document.createElement("div");
      m.className = "min" + (min ? "" : " cero");
      m.textContent = min ? `${min} min` : "—";

      fila.append(f, pista, m);
      cont.appendChild(fila);
    }
    c.appendChild(cont);

    // ---- eje de horas ---------------------------------------------------
    const eje = document.createElement("div");
    eje.className = "eje";
    const horas = document.createElement("div");
    horas.className = "horas";
    [0, 6, 12, 18, 24].forEach((h) => {
      const s = document.createElement("span");
      s.textContent = h === 24 ? "24" : `${h}`;
      s.style.left = `${(h / 24) * 100}%`;
      horas.appendChild(s);
    });
    eje.appendChild(horas);
    c.appendChild(eje);

    // ---- leyenda de deportes presentes ----------------------------------
    const deportes = [...new Set(enRango.map((w) => w.sport))];
    if (deportes.length) {
      const ley = document.createElement("div");
      ley.className = "leyenda";
      deportes.forEach((d) => {
        const min = enRango.filter((w) => w.sport === d)
                           .reduce((a, w) => a + w.duration_min, 0);
        const s = document.createElement("span");
        s.innerHTML = `<i style="background:${color(d)}"></i>${d} · ${min} min`;
        ley.appendChild(s);
      });
      c.appendChild(ley);
    }

    // ---- agregados del reloj -------------------------------------------
    const pie = document.createElement("div");
    pie.className = "pie";
    const carga = this._num("load_entity");
    const vo2 = this._num("vo2_entity");
    const rec = this._num("recovery_entity");
    const add = (v, etiqueta) => {
      if (v === null) return;
      const d = document.createElement("div");
      d.className = "dato";
      d.innerHTML = `<b>${v}</b><span>${etiqueta}</span>`;
      pie.appendChild(d);
    };
    add(carga, "carga de entreno");
    add(vo2, "VO₂ máx");
    add(rec, "h de recuperación");
    if (pie.children.length) c.appendChild(pie);
  }
}

const definir = () => {
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, HaCompanionWorkoutCard);
  } catch (_) { /* ya registrada */ }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({
      type: TAG,
      name: "HA Companion · Entrenamientos",
      description: "Historial de entrenamientos del reloj, colocados a su hora real.",
      preview: false,
    });
  }
};

// Mismo motivo que en la tarjeta del sueño: los módulos de extra_module_url se
// evalúan antes de que el frontend termine de montar su registro de elementos.
definir();
let intentos = 0;
const reintento = setInterval(() => {
  definir();
  if (++intentos >= 60) clearInterval(reintento);
}, 250);

console.info("%c HA-COMPANION-WORKOUT-CARD %c v1.0.0 ",
  "color:#fff;background:#34C77B;font-weight:700",
  "color:#34C77B;background:#fff");
