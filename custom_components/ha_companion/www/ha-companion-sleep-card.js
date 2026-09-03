/**
 * ha-companion-sleep-card
 *
 * Hipnograma para el sensor "Cronología del sueño" de HA Companion.
 *
 * La tarjeta markdown no sirve para esto: Home Assistant sanea el HTML y borra
 * todos los atributos `style`, así que las barras se quedaban en texto plano.
 * Aquí pintamos directamente en el DOM de la tarjeta, sin saneado de por medio.
 *
 * config:
 *   type: custom:ha-companion-sleep-card
 *   entity: sensor.<algo>_cronologia_del_sueno   (obligatorio)
 *   score_entity: sensor.<reloj>                 (opcional, atributo sleep_info)
 *   title: Anoche                                (opcional)
 */

const FASES = [
  { clave: "Despierto",      color: "#F0A030", corto: "Despierto" },
  { clave: "REM",            color: "#A78BFA", corto: "REM" },
  { clave: "Sueño Ligero",   color: "#5B8DEF", corto: "Ligero" },
  { clave: "Sueño Profundo", color: "#3D5AAF", corto: "Profundo" },
];
const COLOR_OTRO = "#64748B";

const ESTILOS = `
  :host { display: block; }
  ha-card { padding: 16px; }
  .cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .total { font-size: 30px; font-weight: 500; line-height: 1.1;
           color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
  .rango { color: var(--secondary-text-color); font-size: 14px;
           font-variant-numeric: tabular-nums; }
  .marca { margin-left: auto; display: flex; align-items: center; gap: 6px;
           color: var(--secondary-text-color); font-size: 13px; }
  .marca b { font-size: 19px; font-weight: 500; color: var(--primary-text-color);
             font-variant-numeric: tabular-nums; }

  .grafica { display: grid; grid-template-columns: auto 1fr; gap: 0 10px;
             margin: 16px 0 4px; }
  .etiquetas { display: grid; }
  .etiquetas span { display: flex; align-items: center; font-size: 11px;
                    color: var(--secondary-text-color); white-space: nowrap; }
  .lienzo { position: relative; }
  .carril { position: absolute; left: 0; right: 0; border-radius: 3px;
            background: var(--divider-color); opacity: .35; }
  .tramo { position: absolute; border-radius: 3px; transition: filter .12s; }
  .tramo:hover { filter: brightness(1.35); }

  .eje { grid-column: 2; position: relative; height: 14px; margin-top: 6px;
         font-size: 11px; color: var(--secondary-text-color);
         font-variant-numeric: tabular-nums; }
  .eje span { position: absolute; transform: translateX(-50%); }

  .leyenda { display: grid; gap: 7px; margin-top: 14px; }
  .fila { display: flex; align-items: center; gap: 9px; }
  .punto { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .nombre { width: 84px; font-size: 13px; color: var(--primary-text-color); }
  .barra { flex: 1; height: 6px; border-radius: 3px; overflow: hidden;
           background: var(--divider-color); }
  .barra > i { display: block; height: 100%; border-radius: 3px; }
  .cifra { flex: none; text-align: right; font-size: 13px; white-space: nowrap;
           color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .cifra em { font-style: normal; opacity: .7; }

  .vacio { color: var(--secondary-text-color); font-size: 14px; }
  .error { color: var(--error-color, #db4437); font-size: 14px; }
`;

const hhmm = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" +
         String(m % 60).padStart(2, "0");
};

const aMinutos = (txt) => {
  if (typeof txt !== "string") return null;
  const p = txt.match(/^(\d{1,2}):(\d{2})/);
  return p ? Number(p[1]) * 60 + Number(p[2]) : null;
};

const duracion = (min) => {
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
};

class HaCompanionSleepCard extends HTMLElement {
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.includes("cronologia_del_sueno"));
    return { type: "custom:ha-companion-sleep-card", entity: e || "" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Falta `entity`: el sensor de cronología del sueño");
    }
    this._config = config;
    this._pintado = null;
    // Home Assistant llama a setConfig más de una vez sobre el mismo elemento
    // (al reevaluar la vista, al reconstruir la tarjeta...). attachShadow por
    // segunda vez lanza NotSupportedError y la tarjeta entera queda en
    // "Error de configuración", que es justo lo que pasaba.
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<style>${ESTILOS}</style><ha-card></ha-card>`;
    }
    this._card = this.shadowRoot.querySelector("ha-card");
    // El estado que ya tuviéramos debe repintarse con la configuración nueva.
    if (this._hass) this._render(this._hass.states[config.entity]);
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config.entity];
    // Repintar solo si cambió algo: el hipnograma es caro y `hass` llega a
    // cada cambio de estado de la casa entera.
    const huella = st ? `${st.state}|${st.last_updated}` : "sin-entidad";
    if (huella === this._pintado) return;
    this._pintado = huella;
    this._render(st);
  }

  getCardSize() { return 5; }

  _puntuacion() {
    const id = this._config.score_entity;
    if (!id || !this._hass) return null;
    const st = this._hass.states[id];
    if (!st) return null;
    let info = st.attributes.sleep_info;
    // El reloj manda `sleep_info` como cadena JSON, no como diccionario.
    if (typeof info === "string") {
      try { info = JSON.parse(info); } catch (_) { return null; }
    }
    return info && info.score != null ? info.score : null;
  }

  _render(st) {
    const c = this._card;
    c.innerHTML = "";
    if (this._config.title) c.setAttribute("header", this._config.title);

    if (!st) {
      c.innerHTML = `<div class="error">No existe ${this._config.entity}</div>`;
      return;
    }

    const tramos = (st.attributes.timeline || [])
      .map((x) => ({
        fase: x.phase,
        ini: aMinutos(x.start),
        fin: aMinutos(x.stop),
        min: Number(x.duration_min) || 0,
        start: x.start,
        stop: x.stop,
      }))
      .filter((x) => x.min > 0);

    if (!tramos.length) {
      c.innerHTML = `<div class="vacio">Todavía no hay datos de sueño.</div>`;
      return;
    }

    const total = tramos.reduce((a, x) => a + x.min, 0);
    const inicio = tramos[0].ini ?? 0;
    const score = this._puntuacion();

    // ---- cabecera -------------------------------------------------------
    const cab = document.createElement("div");
    cab.className = "cab";
    cab.innerHTML =
      `<span class="total">${duracion(total)}</span>` +
      `<span class="rango">${tramos[0].start} → ${tramos[tramos.length - 1].stop}</span>` +
      (score != null
        ? `<span class="marca"><b>${score}</b>puntos</span>`
        : "");
    c.appendChild(cab);

    // ---- hipnograma -----------------------------------------------------
    const presentes = FASES.filter((f) => tramos.some((t) => t.fase === f.clave));
    const otras = [...new Set(tramos.map((t) => t.fase))]
      .filter((f) => !FASES.some((x) => x.clave === f))
      .map((f) => ({ clave: f, color: COLOR_OTRO, corto: f }));
    const niveles = [...presentes, ...otras];

    const ALTO_FILA = 22, HUECO = 6;
    const alto = niveles.length * ALTO_FILA + (niveles.length - 1) * HUECO;

    const graf = document.createElement("div");
    graf.className = "grafica";

    const etiq = document.createElement("div");
    etiq.className = "etiquetas";
    etiq.style.gridTemplateRows = `repeat(${niveles.length}, ${ALTO_FILA}px)`;
    etiq.style.rowGap = `${HUECO}px`;
    niveles.forEach((n) => {
      const s = document.createElement("span");
      s.textContent = n.corto;
      etiq.appendChild(s);
    });

    const lienzo = document.createElement("div");
    lienzo.className = "lienzo";
    lienzo.style.height = `${alto}px`;

    niveles.forEach((_, i) => {
      const carril = document.createElement("div");
      carril.className = "carril";
      carril.style.top = `${i * (ALTO_FILA + HUECO)}px`;
      carril.style.height = `${ALTO_FILA}px`;
      lienzo.appendChild(carril);
    });

    let acumulado = 0;
    tramos.forEach((t) => {
      const fila = niveles.findIndex((n) => n.clave === t.fase);
      const color = (niveles[fila] || {}).color || COLOR_OTRO;
      const d = document.createElement("div");
      d.className = "tramo";
      d.style.left = `${(acumulado / total) * 100}%`;
      d.style.width = `${Math.max((t.min / total) * 100, 0.4)}%`;
      d.style.top = `${Math.max(fila, 0) * (ALTO_FILA + HUECO)}px`;
      d.style.height = `${ALTO_FILA}px`;
      d.style.background = color;
      d.title = `${t.fase} · ${t.start}–${t.stop} · ${t.min} min`;
      lienzo.appendChild(d);
      acumulado += t.min;
    });

    graf.appendChild(etiq);
    graf.appendChild(lienzo);

    // ---- eje de horas ---------------------------------------------------
    const eje = document.createElement("div");
    eje.className = "eje";
    // Una marca por cada hora en punto, sin amontonarlas en pantallas cortas.
    const salto = Math.max(1, Math.ceil(total / 60 / 8));
    const primera = Math.ceil(inicio / 60) * 60;
    const marcas = [];
    for (let m = primera; m < inicio + total; m += 60 * salto) marcas.push(m);
    if (marcas.length) {
      marcas.forEach((m) => {
        const s = document.createElement("span");
        s.textContent = hhmm(m);
        s.style.left = `${((m - inicio) / total) * 100}%`;
        eje.appendChild(s);
      });
      // Va dentro de la rejilla para quedar alineado con el lienzo sin medir nada.
      graf.appendChild(eje);
    }

    c.appendChild(graf);

    // ---- leyenda con el reparto ----------------------------------------
    const ley = document.createElement("div");
    ley.className = "leyenda";
    niveles.forEach((n) => {
      const min = tramos.filter((t) => t.fase === n.clave)
                        .reduce((a, x) => a + x.min, 0);
      if (!min) return;
      const pct = (min / total) * 100;
      const fila = document.createElement("div");
      fila.className = "fila";
      fila.innerHTML =
        `<span class="punto" style="background:${n.color}"></span>` +
        `<span class="nombre">${n.corto}</span>` +
        `<span class="barra"><i style="width:${pct.toFixed(1)}%;background:${n.color}"></i></span>` +
        `<span class="cifra">${duracion(min)} <em>${Math.round(pct)}%</em></span>`;
      ley.appendChild(fila);
    });
    c.appendChild(ley);
  }
}

const TAG = "ha-companion-sleep-card";

// Los módulos de `extra_module_url` se evalúan MUY pronto, antes de que el
// frontend termine de montar su registro de elementos: la definición se hace
// sobre un registro que después se reemplaza, y la tarjeta acaba saliendo como
// "Error de configuración" pese a que el módulo se ejecutó entero (su banner
// aparece en la consola). Como el módulo ya está en el mapa de módulos, cargarlo
// otra vez no lo re-ejecuta. Por eso reafirmamos la definición un rato.
const definir = () => {
  try {
    if (!customElements.get(TAG)) customElements.define(TAG, HaCompanionSleepCard);
  } catch (_) {
    /* ya registrada en este registro: nada que hacer */
  }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === TAG)) {
    window.customCards.push({
      type: TAG,
      name: "HA Companion · Sueño",
      description: "Hipnograma de la última noche a partir de la cronología del sueño.",
      preview: false,
    });
  }
};

definir();
let intentos = 0;
const reintento = setInterval(() => {
  definir();
  if (++intentos >= 60) clearInterval(reintento);   // 15 s y paramos
}, 250);

console.info("%c HA-COMPANION-SLEEP-CARD %c v1.1.0 ",
  "color:#fff;background:#3D5AAF;font-weight:700",
  "color:#3D5AAF;background:#fff");
