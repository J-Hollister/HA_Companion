/**
 * ha-companion-panel
 *
 * Panel propio en la barra lateral con todo lo que manda el reloj.
 *
 * Las entidades NO se buscan por `entity_id`: con `translation_key` el id sale
 * del nombre TRADUCIDO, así que `is_charging` acaba en `..._cargando` y cambia
 * con el idioma. Se buscan por `unique_id` en el registro, que es `<ULID>_<clave>`
 * y sí es estable. De ahí sale un mapa clave -> entity_id por dispositivo.
 *
 * Las secciones de sueño y deporte reutilizan las tarjetas que ya sirve la
 * integración, en vez de repintar lo mismo por segunda vez.
 */

const ULID = 26;   // longitud del prefijo del unique_id

// Algunos estados llegan del reloj en inglés porque no pasan por el catálogo de
// traducciones de la integración. Se traducen aquí, en la capa que los pinta.
const TRADUCE = {
  Awake: "Despierto", Sleeping: "Durmiendo", Napping: "Siesta",
  is_wearing: "Puesto", not_wearing: "Quitado",
};
const traduce = (v) => TRADUCE[v] || v;

const ESTILOS = `
  :host { display: block; height: 100%; background: var(--primary-background-color); }
  .envoltorio { max-width: 1180px; margin: 0 auto; padding: 16px 16px 48px; }

  /* Barra superior pegada arriba, al estilo del resto de paneles de Home
     Assistant: menú, título con subtítulo y acciones a la derecha. */
  header.barra { position: sticky; top: 0; z-index: 3;
                 display: flex; align-items: center; gap: 4px;
                 padding: 4px 4px 10px; flex-wrap: wrap;
                 background: var(--primary-background-color); }
  .bloque-titulo { display: flex; flex-direction: column; justify-content: center;
                   min-width: 0; margin-inline-start: 4px; }
  /* nowrap: sin esto el desplegable le robaba el ancho y "HA Companion" se
     partía en dos líneas en el móvil. */
  .titulo { font-size: 20px; font-weight: 500; color: var(--primary-text-color);
            white-space: nowrap; line-height: 1.2; }
  .subtitulo { font-size: 12px; color: var(--secondary-text-color);
               white-space: nowrap; }
  .selector { margin-left: auto; min-width: 0; max-width: 100%; }
  select { font: inherit; padding: 6px 10px; border-radius: 8px; max-width: 100%;
           color: var(--primary-text-color); background: var(--card-background-color);
           border: 1px solid var(--divider-color); }

  /* En pantallas estrechas el desplegable baja a su propia línea, a todo el
     ancho, en vez de estrujar el título. */
  @media (max-width: 620px) {
    .envoltorio { padding: 12px 12px 40px; }
    .selector { margin-left: 0; flex: 1 0 100%; }
    .selector select { width: 100%; }
    .cabecera { padding: 14px; gap: 12px; }
    .estados { margin-left: 0; }
    .rejilla { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  }

  .cabecera { display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
              background: var(--card-background-color); border-radius: 12px;
              padding: 18px; box-shadow: var(--ha-card-box-shadow, none); }
  .quien { display: flex; flex-direction: column; gap: 2px; }
  .quien b { font-size: 22px; font-weight: 500; color: var(--primary-text-color); }
  .quien span { font-size: 13px; color: var(--secondary-text-color); }
  .estados { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
          padding: 5px 11px; border-radius: 999px; background: var(--secondary-background-color);
          color: var(--secondary-text-color); white-space: nowrap; }
  .chip.on { background: color-mix(in srgb, var(--primary-color) 22%, transparent);
             color: var(--primary-text-color); }
  .chip.alerta { background: color-mix(in srgb, #F0A030 28%, transparent);
                 color: var(--primary-text-color); }

  h2 { font-size: 15px; font-weight: 500; color: var(--primary-text-color);
       margin: 26px 0 10px; display: flex; align-items: center; gap: 8px; }
  h2 ha-icon { --mdc-icon-size: 19px; color: var(--secondary-text-color); }

  .rejilla { display: grid; gap: 12px;
             grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); }
  .dato { background: var(--card-background-color); border-radius: 12px; padding: 14px;
          display: flex; align-items: center; gap: 12px;
          box-shadow: var(--ha-card-box-shadow, none); }
  .dato.pulsable { cursor: pointer; transition: background .12s, transform .12s; }
  .dato.pulsable:hover { background: var(--secondary-background-color); }
  .dato.pulsable:active { transform: scale(.985); }
  .dato.pulsable:focus-visible { outline: 2px solid var(--primary-color);
                                 outline-offset: 2px; }
  .chip.pulsable { cursor: pointer; }
  .chip.pulsable:hover { filter: brightness(1.25); }
  .dato .txt { min-width: 0; }
  .dato .val { font-size: 21px; font-weight: 500; color: var(--primary-text-color);
               font-variant-numeric: tabular-nums; line-height: 1.15;
               white-space: nowrap; }
  .dato .val small { font-size: 12px; font-weight: 400;
                     color: var(--secondary-text-color); margin-left: 2px; }
  .dato .eti { font-size: 12px; color: var(--secondary-text-color);
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dato .meta { font-size: 11px; color: var(--secondary-text-color); opacity: .75; }

  /* El icono va DENTRO del aro. Ojo: en el DOM es hermano de .aro, no hijo, así
     que la regla tiene que colgar de .envoltura-aro. Con el selector .aro
     ha-icon no casaba nada, el absolute no se aplicaba y el icono caia fuera. */
  .envoltura-aro { position: relative; width: 42px; height: 42px; flex: none; }
  .aro { --p: 0; --c: var(--primary-color);
         width: 100%; height: 100%; border-radius: 50%;
         background: conic-gradient(var(--c) calc(var(--p) * 1%), var(--divider-color) 0);
         display: grid; place-items: center; }
  .aro::after { content: ""; width: 32px; height: 32px; border-radius: 50%;
                background: var(--card-background-color); }
  .envoltura-aro ha-icon { position: absolute; inset: 0; display: grid;
                           place-items: center; --mdc-icon-size: 17px;
                           color: var(--c); pointer-events: none; }

  .tarjetas { display: grid; gap: 12px; }
  .aviso { background: var(--card-background-color); border-radius: 12px; padding: 16px;
           color: var(--secondary-text-color); font-size: 14px; }
  .pie { margin-top: 30px; font-size: 12px; color: var(--secondary-text-color);
         opacity: .7; text-align: center; }
`;

// clave -> {etiqueta, unidad, icono, objetivo, formato}
const HOY = [
  { k: "steps",         eti: "Pasos",       obj: "steps_target",       icono: "mdi:shoe-print",     color: "#5B8DEF" },
  { k: "calories",      eti: "Calorías",    obj: "calories_target",    icono: "mdi:fire",           color: "#F0A030", uni: "kcal" },
  { k: "distance",      eti: "Distancia",   icono: "mdi:map-marker-distance", color: "#34C77B", uni: "m" },
  { k: "stand_hours",   eti: "Horas de pie", obj: "stand_hours_target", icono: "mdi:human-handsup", color: "#A78BFA" },
  { k: "fat_burning",   eti: "Quema grasa", obj: "fat_burning_target", icono: "mdi:lightning-bolt", color: "#E86FA9", uni: "min" },
  // La meta del PAI son 100 puntos en 7 días. No viene como sensor de objetivo
  // porque es un valor fijo de Zepp, así que va escrito aquí.
  { k: "pai_total",     eti: "PAI (7 días)", icono: "mdi:heart-pulse", color: "#E5484D",
    metaFija: 100 },
];

const AHORA = [
  { k: "heart_rate",  eti: "Pulso",        icono: "mdi:heart-pulse",  uni: "ppm" },
  { k: "heart_resting", eti: "En reposo",  icono: "mdi:heart-outline", uni: "ppm" },
  { k: "heart_max",   eti: "Máximo hoy",   icono: "mdi:heart-flash",  uni: "ppm" },
  { k: "stress",      eti: "Estrés",       icono: "mdi:emoticon-neutral-outline" },
  { k: "spo2",        eti: "Oxígeno",      icono: "mdi:water-percent", uni: "%" },
  { k: "temperature", eti: "Temperatura",  icono: "mdi:thermometer",  uni: "°" },
  { k: "altitude_state", eti: "Altitud",   icono: "mdi:image-filter-hdr", uni: "m" },
  { k: "air_pressure_state", eti: "Presión", icono: "mdi:gauge",      uni: "hPa" },
];

const RELOJ = [
  { k: "firmware_version", eti: "Firmware",       icono: "mdi:chip" },
  { k: "app_version",      eti: "App",            icono: "mdi:cellphone-arrow-down" },
  { k: "published_version", eti: "Última publicada", icono: "mdi:cloud-download-outline" },
  { k: "os_version",       eti: "Zepp OS",        icono: "mdi:memory" },
  { k: "min_api",          eti: "API mínima",     icono: "mdi:api" },
  { k: "screen_brightness", eti: "Brillo",        icono: "mdi:brightness-6", uni: "%" },
  { k: "disk_free",        eti: "Disco libre",    icono: "mdi:harddisk" },
  { k: "record_time",      eti: "Sincronizado", icono: "mdi:sync", fecha: true },
];

const MODOS = [
  { k: "system_mode_dnd",              eti: "No molestar" },
  { k: "system_mode_sleep",            eti: "Modo sueño" },
  { k: "system_mode_theater",          eti: "Modo teatro" },
  { k: "system_mode_power_saving",     eti: "Ahorro" },
  { k: "system_mode_ultra_power_saving", eti: "Ultra ahorro" },
  { k: "screen_aod_mode",              eti: "Pantalla siempre activa" },
];

class HaCompanionPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._relojes = null;      // [{device_id, nombre, claves:{}}]
    this._elegido = null;
    this._huella = null;
    this._cargando = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._relojes && !this._cargando) { this._descubrir(); return; }
    this._quizasPintar();
  }
  set narrow(v) {
    const antes = this._narrow;
    this._narrow = v;
    if (antes !== undefined && antes !== v) this._pintar();
  }
  get narrow() { return this._narrow; }
  set route(v) {}
  set panel(v) { this._panel = v; }

  /** Mapa clave -> entity_id por dispositivo, leído del registro. */
  async _descubrir() {
    this._cargando = true;
    let ents, devs;
    try {
      [ents, devs] = await Promise.all([
        this._hass.callWS({ type: "config/entity_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
      ]);
    } catch (e) {
      this._relojes = "error";
      this._cargando = false;
      this._pintar();
      return;
    }
    const nombreDe = new Map(devs.map((d) => [d.id, d.name_by_user || d.name]));
    const porDisp = new Map();
    for (const e of ents) {
      if (e.platform !== "ha_companion" || !e.device_id) continue;
      const clave = e.unique_id.slice(ULID + 1);
      if (!clave) continue;
      if (!porDisp.has(e.device_id)) {
        porDisp.set(e.device_id, {
          device_id: e.device_id,
          nombre: nombreDe.get(e.device_id) || "Reloj",
          claves: {},
        });
      }
      porDisp.get(e.device_id).claves[clave] = e.entity_id;
    }
    this._relojes = [...porDisp.values()];
    // Por defecto, el reloj que esté dando datos.
    const vivo = this._relojes.find((r) => this._vivo(r));
    this._elegido = (vivo || this._relojes[0] || {}).device_id || null;
    this._cargando = false;
    this._pintar();
  }

  _vivo(reloj) {
    const id = reloj.claves["record_time"] || reloj.claves["battery"];
    const st = id && this._hass.states[id];
    return !!st && st.state !== "unavailable" && st.state !== "unknown";
  }

  _reloj() {
    if (!Array.isArray(this._relojes)) return null;
    return this._relojes.find((r) => r.device_id === this._elegido) || this._relojes[0];
  }

  _st(clave) {
    const r = this._reloj();
    const id = r && r.claves[clave];
    return id ? this._hass.states[id] : null;
  }

  _val(clave) {
    const st = this._st(clave);
    if (!st || st.state === "unavailable" || st.state === "unknown") return null;
    return st.state;
  }

  _num(clave) {
    const v = this._val(clave);
    return v === null || isNaN(Number(v)) ? null : Number(v);
  }

  /** Repintar solo cuando cambie algo del reloj elegido, no con la casa entera. */
  _quizasPintar() {
    const r = this._reloj();
    if (!r) return;
    const h = Object.values(r.claves)
      .map((id) => { const s = this._hass.states[id]; return s ? s.state : "-"; })
      .join("|");
    if (h === this._huella) return;
    this._huella = h;
    this._pintar();
  }

  /** Abre el diálogo de más información, que es donde vive la gráfica.
   *  El evento tiene que ir con `composed: true` para poder salir del shadow
   *  DOM del panel y llegar a <home-assistant>, que es quien lo atiende. */
  _masInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  /** Deja un elemento pulsable, también con teclado. */
  _pulsable(el, entityId) {
    if (!entityId) return el;
    el.classList.add("pulsable");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", `Ver ${entityId}`);
    el.addEventListener("click", () => this._masInfo(entityId));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._masInfo(entityId);
      }
    });
    return el;
  }

  _tarjeta(tipo, config) {
    const el = document.createElement(tipo);
    if (!customElements.get(tipo)) return null;
    try {
      el.setConfig({ type: "custom:" + tipo, ...config });
      el.hass = this._hass;
      return el;
    } catch (e) {
      return null;
    }
  }

  _pintar() {
    const sr = this.shadowRoot;
    sr.innerHTML = `<style>${ESTILOS}</style>`;
    const env = document.createElement("div");
    env.className = "envoltorio";

    // ── barra superior ──────────────────────────────────────────────────
    const barra = document.createElement("header");
    barra.className = "barra";

    // Botón de menú. Sin esto, en el móvil no hay forma de volver a la barra
    // lateral de Home Assistant: el panel ocupa la pantalla entera y se queda
    // uno atrapado dentro. Home Assistant no lo pone por su cuenta en los
    // paneles personalizados, lo tiene que dibujar el propio panel.
    const boton = document.createElement("ha-menu-button");
    boton.hass = this._hass;
    boton.narrow = !!this._narrow;
    barra.appendChild(boton);

    const bloque = document.createElement("div");
    bloque.className = "bloque-titulo";
    const version = (this._panel && this._panel.config &&
                     this._panel.config.version) || "";
    bloque.innerHTML = `<div class="titulo">HA Companion</div>` +
      `<div class="subtitulo">${version ? "v" + version + " · " : ""}` +
      `datos de tu reloj</div>`;
    barra.appendChild(bloque);
    if (Array.isArray(this._relojes) && this._relojes.length > 1) {
      const sel = document.createElement("select");
      sel.className = "selector";
      this._relojes.forEach((r) => {
        const o = document.createElement("option");
        o.value = r.device_id;
        o.textContent = r.nombre + (this._vivo(r) ? "" : " (sin datos)");
        if (r.device_id === this._elegido) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", (e) => {
        this._elegido = e.target.value;
        this._huella = null;
        this._pintar();
      });
      barra.appendChild(sel);
    }
    env.appendChild(barra);

    if (this._relojes === "error") {
      env.innerHTML += `<div class="aviso">No se pudo leer el registro de entidades.</div>`;
      sr.appendChild(env); return;
    }
    if (!this._relojes) {
      env.innerHTML += `<div class="aviso">Buscando relojes…</div>`;
      sr.appendChild(env); return;
    }
    if (!this._reloj()) {
      env.innerHTML += `<div class="aviso">No hay ningún reloj configurado todavía.</div>`;
      sr.appendChild(env); return;
    }

    env.appendChild(this._cabecera());
    env.appendChild(this._seccion("Hoy", "mdi:calendar-today", this._rejillaHoy()));

    const semana = this._rejillaSemana();
    if (semana) env.appendChild(this._seccion("Esta semana", "mdi:calendar-week", semana));
    env.appendChild(this._seccion("Ahora mismo", "mdi:pulse", this._rejilla(AHORA)));

    const sueno = this._bloqueSueno();
    if (sueno) env.appendChild(this._seccion("Sueño", "mdi:sleep", sueno));

    const deporte = this._bloqueDeporte();
    if (deporte) env.appendChild(this._seccion("Deporte", "mdi:run", deporte));

    env.appendChild(this._seccion("El reloj", "mdi:watch", this._rejilla(RELOJ)));
    env.appendChild(this._seccion("Modos", "mdi:tune", this._chipsModos()));

    const pie = document.createElement("div");
    pie.className = "pie";
    pie.textContent = "HA Companion";
    env.appendChild(pie);

    sr.appendChild(env);
  }

  _seccion(titulo, icono, cuerpo) {
    const frag = document.createDocumentFragment();
    const h = document.createElement("h2");
    h.innerHTML = `<ha-icon icon="${icono}"></ha-icon>${titulo}`;
    frag.appendChild(h);
    frag.appendChild(cuerpo);
    const d = document.createElement("div");
    d.appendChild(frag);
    return d;
  }

  _cabecera() {
    const c = document.createElement("div");
    c.className = "cabecera";

    const nombre = this._val("user_nick_name") || this._reloj().nombre;
    const modelo = this._val("device_name") || "";
    const bat = this._num("battery");
    const peso = this._val("user_weight");
    const altura = this._val("user_height");
    const edad = this._val("user_age");

    const quien = document.createElement("div");
    quien.className = "quien";
    const detalles = [modelo, edad && `${edad} años`, altura && `${altura} cm`,
                      peso && `${peso} kg`].filter(Boolean).join(" · ");
    quien.innerHTML = `<b>${nombre}</b><span>${detalles}</span>`;
    c.appendChild(quien);

    const chips = document.createElement("div");
    chips.className = "estados";
    const claves = this._reloj().claves || {};
    const añade = (txt, clase, clave) => {
      const s = document.createElement("span");
      s.className = "chip" + (clase ? " " + clase : "");
      s.textContent = txt;
      chips.appendChild(this._pulsable(s, claves[clave]));
    };
    if (bat !== null) añade(`Batería ${bat}%`, bat <= 20 ? "alerta" : "", "battery");
    if (this._val("is_charging") === "on") añade("Cargando", "on", "is_charging");
    if (this._val("wear") === "1" || this._val("wear") === "is_wearing") añade("Puesto", "on", "wear");
    if (this._val("is_sleeping") === "on") añade("Durmiendo", "on", "is_sleeping");
    if (this._val("is_moving") === "on") añade("En movimiento", "on", "is_moving");
    if (this._val("update_pending") === "on") añade("Actualización disponible", "alerta", "update_pending");

    // Si el reloj deja de enviar, todo lo demás se queda congelado sin avisar.
    const st = this._st("sync_age");
    const min = this._num("sync_age");
    if (min !== null) {
      const viejo = st && st.attributes && st.attributes.is_stale;
      if (viejo) {
        const h = Math.floor(min / 60);
        añade(`Sin sincronizar hace ${h ? h + " h" : min + " min"}`, "alerta", "sync_age");
      }
    }
    c.appendChild(chips);
    return c;
  }

  _dato({ val, eti, meta, uni, icono, color, pct, entidad }) {
    const d = document.createElement("div");
    d.className = "dato";
    if (pct !== undefined && icono) {
      const c = color || "var(--primary-color)";
      const w = document.createElement("div");
      w.className = "envoltura-aro";
      w.style.setProperty("--c", c);
      w.innerHTML = `<div class="aro" style="--p:${Math.min(pct, 100)}"></div>` +
                    `<ha-icon icon="${icono}"></ha-icon>`;
      d.appendChild(w);
    } else if (icono) {
      const i = document.createElement("ha-icon");
      i.setAttribute("icon", icono);
      i.style.color = color || "var(--secondary-text-color)";
      i.style.setProperty("--mdc-icon-size", "24px");
      i.style.flex = "none";
      d.appendChild(i);
    }
    const t = document.createElement("div");
    t.className = "txt";
    t.innerHTML = `<div class="val">${val}${uni ? `<small>${uni}</small>` : ""}</div>` +
                  `<div class="eti">${eti}</div>` +
                  (meta ? `<div class="meta">${meta}</div>` : "");
    d.appendChild(t);
    return this._pulsable(d, entidad);
  }

  _rejillaHoy() {
    const g = document.createElement("div");
    g.className = "rejilla";
    HOY.forEach((f) => {
      const v = this._num(f.k);
      if (v === null) return;
      const obj = f.obj ? this._num(f.obj) : (f.metaFija || null);
      g.appendChild(this._dato({
        val: v.toLocaleString("es-ES"),
        uni: f.uni,
        eti: f.eti,
        meta: obj ? `de ${obj.toLocaleString("es-ES")}` : null,
        icono: f.icono,
        color: f.color,
        pct: obj ? (v / obj) * 100 : undefined,
        entidad: (this._reloj().claves || {})[f.k],
      }));
    });
    return g;
  }

  /** Acumulado de 7 días, del atributo week_total que publica la integración. */
  _rejillaSemana() {
    const g = document.createElement("div");
    g.className = "rejilla";
    HOY.forEach((f) => {
      const st = this._st(f.k);
      const a = st && st.attributes;
      if (!a || a.week_total === null || a.week_total === undefined) return;
      const dias = (a.week_days || []).length;
      g.appendChild(this._dato({
        val: Math.round(a.week_total).toLocaleString("es-ES"),
        uni: f.uni,
        eti: f.eti,
        meta: a.week_average !== null && a.week_average !== undefined
          ? `${Math.round(a.week_average).toLocaleString("es-ES")} al día · ${dias} ${dias === 1 ? "día" : "días"}`
          : null,
        icono: f.icono,
        color: f.color,
        entidad: (this._reloj().claves || {})[f.k],
      }));
    });
    return g.children.length ? g : null;
  }

  _rejilla(defs) {
    const g = document.createElement("div");
    g.className = "rejilla";
    defs.forEach((f) => {
      let v = this._val(f.k);
      if (v === null) return;
      if (f.fecha) {
        const d = new Date(v);
        v = isNaN(d) ? v : d.toLocaleString("es-ES",
          { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      } else if (!isNaN(Number(v))) {
        v = Number(v).toLocaleString("es-ES");
      } else {
        v = traduce(v);
      }
      g.appendChild(this._dato({
        val: v, uni: f.uni, eti: f.eti, icono: f.icono,
        entidad: (this._reloj().claves || {})[f.k],
      }));
    });
    if (!g.children.length) {
      g.className = "";
      g.innerHTML = `<div class="aviso">Sin datos todavía.</div>`;
    }
    return g;
  }

  _chipsModos() {
    const c = document.createElement("div");
    c.className = "estados";
    c.style.marginLeft = "0";
    MODOS.forEach((m) => {
      const v = this._val(m.k);
      if (v === null) return;
      const on = v === "on" || v === "true";
      const s = document.createElement("span");
      s.className = "chip" + (on ? " on" : "");
      s.textContent = `${m.eti}: ${on ? "sí" : "no"}`;
      c.appendChild(this._pulsable(s, (this._reloj().claves || {})[m.k]));
    });
    if (!c.children.length) c.innerHTML = `<div class="aviso">Sin datos todavía.</div>`;
    return c;
  }

  _bloqueSueno() {
    const r = this._reloj();
    const cont = document.createElement("div");
    cont.className = "tarjetas";

    const linea = this._rejilla([
      { k: "sleep_score",  eti: "Puntuación",   icono: "mdi:star-outline" },
      { k: "sleep_status", eti: "Estado",       icono: "mdi:sleep" },
      { k: "sleep_start_time", eti: "Se durmió", icono: "mdi:weather-night" },
      { k: "sleep_end_time",   eti: "Se despertó", icono: "mdi:weather-sunset-up" },
    ]);
    cont.appendChild(linea);

    if (r.claves.sleep_timeline) {
      const t = this._tarjeta("ha-companion-sleep-card", {
        entity: r.claves.sleep_timeline,
      });
      if (t) cont.appendChild(t);
    }
    const fases = ["sleep_deep_minutes", "sleep_rem_minutes",
                   "sleep_light_minutes", "sleep_wake_minutes"];
    if (fases.every((k) => r.claves[k])) {
      const t = this._tarjeta("ha-companion-sleep-week-card", {
        entities: {
          Profundo: r.claves.sleep_deep_minutes,
          REM: r.claves.sleep_rem_minutes,
          Ligero: r.claves.sleep_light_minutes,
          Despierto: r.claves.sleep_wake_minutes,
        },
        score_entity: r.claves.sleep_score,
        days: 7,
      });
      if (t) cont.appendChild(t);
    }
    return cont.children.length ? cont : null;
  }

  _bloqueDeporte() {
    const r = this._reloj();
    const cont = document.createElement("div");
    cont.className = "tarjetas";

    cont.appendChild(this._rejilla([
      { k: "workout_count",              eti: "Entrenamientos", icono: "mdi:counter" },
      { k: "workout_training_load",      eti: "Carga",          icono: "mdi:weight" },
      { k: "workout_vo2_max",            eti: "VO₂ máx",        icono: "mdi:lungs" },
      { k: "workout_full_recovery_time", eti: "Recuperación",   icono: "mdi:bed-clock", uni: "h" },
      { k: "workout_last_sport_type",    eti: "Último deporte", icono: "mdi:run-fast" },
      { k: "workout_last_duration",      eti: "Duración",       icono: "mdi:timer-outline", uni: "min" },
    ]));

    if (r.claves.workout_history) {
      // Sin load/vo2/recovery: ya están en la fila de datos de encima.
      const t = this._tarjeta("ha-companion-workout-card", {
        entity: r.claves.workout_history,
        days: 7,
      });
      if (t) cont.appendChild(t);
    }
    return cont.children.length ? cont : null;
  }
}

if (!customElements.get("ha-companion-panel")) {
  customElements.define("ha-companion-panel", HaCompanionPanel);
}
