/**
 * ha-companion-sleep-week-card
 *
 * Las últimas N noches, una columna por noche, apiladas por fase.
 *
 * No necesita nada nuevo de la integración: los sensores de fase llevan
 * `state_class: measurement`, así que el recorder ya les genera estadísticas
 * por su cuenta. La tarjeta se las pide por websocket
 * (`recorder/statistics_during_period`).
 *
 * Se piden por HORAS, no por días, y de cada día se coge la última lectura
 * anterior al CORTE (13:00 local). Con el máximo diario los números salían
 * inflados: el reloj sincroniza varias veces y el máximo de cada fase cae en un
 * momento distinto del día, así que sumarlos daba una noche que nunca existió
 * (9 h 23 de media cuando la noche real había sido de 8 h 0). Tomando todas las
 * fases del MISMO instante, el reparto es coherente.
 *
 * Dos trampas más que hay que esquivar con estos datos:
 *  - Un reinicio de Home Assistant recrea el sensor maestro vacío, y ese día
 *    queda registrado como 0. No es una noche sin dormir: es un hueco. Se
 *    descarta, no se pinta como cero.
 *  - Puede haber días sin ninguna estadística. Se dejan en blanco.
 *
 * config:
 *   type: custom:ha-companion-sleep-week-card
 *   prefix: sensor.balance_jesus          (de ahí compone las cuatro fases)
 *     — o bien —
 *   entities: {Profundo: sensor.x, REM: sensor.y, Ligero: ..., Despierto: ...}
 *     (el panel las pasa así: busca por unique_id, que no cambia con el idioma)
 *   score_entity: sensor.<...>_puntuacion_del_sueno   (opcional)
 *   days: 7                               (opcional)
 *   title: Las últimas noches             (opcional)
 */

const TAG = "ha-companion-sleep-week-card";

// Mismo lenguaje de color que ha-companion-sleep-card: se leen juntas.
const FASES = [
  { sufijo: "_sueno_profundo", nombre: "Profundo", color: "#3D5AAF" },
  { sufijo: "_sueno_rem",      nombre: "REM",      color: "#A78BFA" },
  { sufijo: "_sueno_ligero",   nombre: "Ligero",   color: "#5B8DEF" },
  { sufijo: "_tiempo_despierto", nombre: "Despierto", color: "#F0A030" },
];

const DIAS = ["D", "L", "M", "X", "J", "V", "S"];

const ESTILOS = `
  :host { display: block; }
  ha-card { padding: 16px; }

  .cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .media { font-size: 30px; font-weight: 500; line-height: 1.1;
           color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .sub { color: var(--secondary-text-color); font-size: 14px; }

  .grafica { display: flex; align-items: flex-end; gap: 8px; height: 170px;
             margin: 18px 0 0; }
  .col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end;
         height: 100%; gap: 0; position: relative; }
  .pila { display: flex; flex-direction: column-reverse; border-radius: 4px;
          overflow: hidden; transition: filter .12s; }
  .pila:hover { filter: brightness(1.3); }
  .trozo { width: 100%; }
  .hueco { border: 1px dashed var(--divider-color); border-radius: 4px; height: 26px;
           opacity: .6; }

  .pies { display: flex; gap: 8px; margin-top: 7px; }
  .pie { flex: 1; text-align: center; font-size: 11px;
         color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .pie b { display: block; font-size: 12px; color: var(--primary-text-color);
           font-weight: 500; }
  .pie.sin { opacity: .4; }

  .leyenda { display: flex; gap: 13px; flex-wrap: wrap; margin-top: 15px;
             padding-top: 13px; border-top: 1px solid var(--divider-color);
             font-size: 12px; color: var(--secondary-text-color); }
  .leyenda i { display: inline-block; width: 8px; height: 8px; border-radius: 2px;
               margin-right: 5px; vertical-align: middle; }

  .nota { margin-top: 10px; font-size: 11px; color: var(--secondary-text-color);
          opacity: .8; }
  .vacio { color: var(--secondary-text-color); font-size: 14px; }
  .error { color: var(--error-color, #db4437); font-size: 14px; }
`;

const dur = (min) => {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60}` : `${m} m`;
};

class HaCompanionSleepWeekCard extends HTMLElement {
  static getStubConfig() {
    return { type: "custom:" + TAG, prefix: "sensor.balance_jesus" };
  }

  setConfig(config) {
    if (!config || (!config.prefix && !config.entities)) {
      throw new Error("Falta `prefix` (o `entities`), por ejemplo sensor.balance_jesus");
    }
    this._config = config;
    this._noches = null;
    this._pedido = 0;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${ESTILOS}</style><ha-card></ha-card>`;
    }
    this._card = this.shadowRoot.querySelector("ha-card");
    if (this._hass) this._quizasPedir(true);
  }

  set hass(hass) {
    const primera = !this._hass;
    this._hass = hass;
    this._quizasPedir(primera);
  }

  getCardSize() { return 6; }

  /** [{nombre, color, id}] — desde `entities` si viene, si no desde `prefix`. */
  _fases() {
    return FASES.map((f) => ({
      nombre: f.nombre,
      color: f.color,
      id: (this._config.entities && this._config.entities[f.nombre]) ||
          (this._config.prefix ? this._config.prefix + f.sufijo : null),
    })).filter((f) => f.id);
  }

  /** Las estadísticas cambian una vez al día: pedirlas en cada `hass` sería
   *  una consulta por cada cambio de estado de la casa entera. */
  _quizasPedir(forzar) {
    const ahora = Date.now();
    if (!forzar && ahora - this._pedido < 15 * 60 * 1000) return;
    this._pedido = ahora;
    this._pedirEstadisticas();
  }

  async _pedirEstadisticas() {
    const dias = Math.max(2, Number(this._config.days) || 7);
    const fases = this._fases();
    const ids = fases.map((f) => f.id);
    if (this._config.score_entity) ids.push(this._config.score_entity);

    const fin = new Date();
    const ini = new Date(fin.getTime() - (dias + 1) * 86400000);

    let res;
    try {
      res = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: ini.toISOString(),
        end_time: fin.toISOString(),
        statistic_ids: ids,
        period: "hour",
        types: ["max"],
      });
    } catch (e) {
      this._noches = "error";
      this._render();
      return;
    }

    // De cada día nos quedamos con la última lectura ANTERIOR AL CORTE, y la
    // misma hora para todas las fases: así el reparto es de un instante real.
    const CORTE = 13;
    const porDia = new Map();
    const ultima = new Map();   // clave `${dia}|${id}` -> {hora, valor}

    for (const [id, filas] of Object.entries(res || {})) {
      for (const fila of filas) {
        const t = new Date(fila.start);
        if (t.getHours() >= CORTE) continue;
        if (fila.max == null) continue;
        const d = new Date(t); d.setHours(0, 0, 0, 0);
        const k = `${d.getTime()}|${id}`;
        const prev = ultima.get(k);
        if (!prev || t.getHours() >= prev.hora) {
          ultima.set(k, { hora: t.getHours(), valor: fila.max, dia: d.getTime() });
        }
      }
    }

    for (const [k, x] of ultima) {
      const id = k.split("|")[1];
      if (!porDia.has(x.dia)) {
        porDia.set(x.dia, { fecha: new Date(x.dia), fases: {}, score: null });
      }
      if (id === this._config.score_entity) {
        porDia.get(x.dia).score = Math.round(x.valor);
      } else {
        const f = fases.find((y) => y.id === id);
        if (f) porDia.get(x.dia).fases[f.nombre] = x.valor;
      }
    }
    this._noches = porDia;
    this._render();
  }

  _render() {
    const c = this._card;
    c.innerHTML = "";
    if (this._config.title) c.setAttribute("header", this._config.title);

    if (this._noches === "error") {
      c.innerHTML = `<div class="error">No se pudieron leer las estadísticas.</div>`;
      return;
    }
    if (!this._noches) {
      c.innerHTML = `<div class="vacio">Leyendo las últimas noches…</div>`;
      return;
    }

    const dias = Math.max(2, Number(this._config.days) || 7);
    const listaFases = this._fases();
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const cols = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoy); d.setDate(d.getDate() - i);
      const n = this._noches.get(d.getTime());
      const fases = (n && n.fases) || {};
      const total = listaFases.reduce((a, f) => a + (fases[f.nombre] || 0), 0);
      // Un reinicio deja el día a 0: eso es un hueco, no una noche en vela.
      cols.push({ fecha: d, fases, total, score: n ? n.score : null, hay: total > 0 });
    }

    const conDatos = cols.filter((x) => x.hay);
    if (!conDatos.length) {
      c.innerHTML = `<div class="vacio">Todavía no hay noches guardadas. ` +
                    `Se irá llenando cada mañana.</div>`;
      return;
    }

    const media = conDatos.reduce((a, x) => a + x.total, 0) / conDatos.length;
    const tope = Math.max(...conDatos.map((x) => x.total));

    // ---- cabecera -------------------------------------------------------
    const cab = document.createElement("div");
    cab.className = "cab";
    cab.innerHTML =
      `<span class="media">${dur(media)}</span>` +
      `<span class="sub">de media · ${conDatos.length} ` +
      `${conDatos.length === 1 ? "noche" : "noches"} de ${dias}</span>`;
    c.appendChild(cab);

    // ---- columnas -------------------------------------------------------
    const g = document.createElement("div");
    g.className = "grafica";
    cols.forEach((x) => {
      const col = document.createElement("div");
      col.className = "col";
      if (!x.hay) {
        const h = document.createElement("div");
        h.className = "hueco";
        h.title = "Sin datos de esa noche";
        col.appendChild(h);
      } else {
        const pila = document.createElement("div");
        pila.className = "pila";
        pila.style.height = `${(x.total / tope) * 100}%`;
        pila.title = listaFases.filter((f) => x.fases[f.nombre])
          .map((f) => `${f.nombre} ${Math.round(x.fases[f.nombre])} min`)
          .join(" · ");
        listaFases.forEach((f) => {
          const v = x.fases[f.nombre];
          if (!v) return;
          const t = document.createElement("div");
          t.className = "trozo";
          t.style.height = `${(v / x.total) * 100}%`;
          t.style.background = f.color;
          pila.appendChild(t);
        });
        col.appendChild(pila);
      }
      g.appendChild(col);
    });
    c.appendChild(g);

    // ---- pies de columna ------------------------------------------------
    const pies = document.createElement("div");
    pies.className = "pies";
    cols.forEach((x) => {
      const p = document.createElement("div");
      p.className = "pie" + (x.hay ? "" : " sin");
      p.innerHTML = `<b>${DIAS[x.fecha.getDay()]}</b>` +
                    (x.hay ? dur(x.total) : "—") +
                    (x.hay && x.score ? `<br>${x.score}` : "");
      pies.appendChild(p);
    });
    c.appendChild(pies);

    // ---- leyenda --------------------------------------------------------
    const ley = document.createElement("div");
    ley.className = "leyenda";
    listaFases.forEach((f) => {
      const min = conDatos.reduce((a, x) => a + (x.fases[f.nombre] || 0), 0);
      if (!min) return;
      const s = document.createElement("span");
      s.innerHTML = `<i style="background:${f.color}"></i>${f.nombre} · ` +
                    `${Math.round(min / conDatos.length)} min de media`;
      ley.appendChild(s);
    });
    c.appendChild(ley);

    if (conDatos.length < dias) {
      const n = document.createElement("div");
      n.className = "nota";
      n.textContent = "Las noches en blanco no tienen estadística guardada; " +
                      "un reinicio de Home Assistant deja ese hueco.";
      c.appendChild(n);
    }
  }
}

const definir = () => {
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, HaCompanionSleepWeekCard);
  } catch (_) { /* ya registrada */ }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({
      type: TAG,
      name: "HA Companion · Sueño semanal",
      description: "Las últimas noches apiladas por fase, desde las estadísticas del recorder.",
      preview: false,
    });
  }
};

definir();
let intentos = 0;
const reintento = setInterval(() => {
  definir();
  if (++intentos >= 60) clearInterval(reintento);
}, 250);

console.info("%c HA-COMPANION-SLEEP-WEEK-CARD %c v1.0.0 ",
  "color:#fff;background:#5B8DEF;font-weight:700",
  "color:#5B8DEF;background:#fff");
