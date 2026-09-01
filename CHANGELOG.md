# Changelog

Todos los cambios notables de la integración **HA Companion** para Home Assistant.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado es [SemVer](https://semver.org/lang/es/).

## [0.1.6] - 2026-08-31

### Añadido
- `sensor.<usuario>_sleep_timeline`: estado = minutos totales de la última sesión
  de sueño; atributo `timeline` con la lista de ciclos (fase, hora de inicio/fin y
  duración en minutos) y `segment_count`, extraída del mismo `sleep_stage_data`
  que ya usan los sensores `sleep_*_minutes`. El nombre de cada fase sale en
  español o inglés según el idioma de la instancia de HA.
- `binary_sensor.<usuario>_is_charging`: infiere si el reloj está cargando a
  partir del delta de `battery_state` entre actualizaciones consecutivas (Zepp OS
  no expone un flag nativo de carga).
- Atributo `last_week` en PAI y Estrés: media/mín/máx diarios de los últimos 7
  días, leído de las estadísticas propias del recorder de HA (ambos sensores ya
  llevan `state_class: measurement`, así que HA ya las generaba solo).

## [0.1.5] - 2026-07-17

### Añadido
- Puente REST para la app del reloj (el reloj solo puede hacer HTTP, y HA sirve
  estos registros únicamente por WebSocket):
  - `GET /api/ha_companion/areas` → áreas con `area_id`, `name`, `icon` y los
    sensores asignados `temperature_entity_id` / `humidity_entity_id` (para la
    vista Casa del reloj). Usa `getattr` para seguir funcionando en cores
    anteriores a HA 2024.6.
  - `GET /api/ha_companion/labels` → etiquetas con `label_id`, `name`, `icon` y
    `color`.
  - Ambas vistas requieren autenticación y se registran una sola vez por instancia.

### Corregido
- `VERSION_JSON_URL` apuntaba a una ruta inexistente; ahora apunta a
  `version.json` en la raíz del repo de release.
- Restaurado el nombre del descriptor de HACS a `hacs.json` (se había renombrado
  a `hacks.json` por error, lo que impedía que HACS reconociera el repositorio).
- `documentation` e `issue_tracker` del manifest apuntan al repositorio oficial
  `AguacatecHA/HA_Companion`.

### Interno
- Añadido `.gitignore` y dejado de rastrear los `__pycache__/*.pyc`.

## [0.1.4]

### Añadido
- Plataforma `device_tracker` para la ubicación GPS del reloj.
- Sensor «Recent Workouts» con el historial de entrenamientos formateado.

### Corregido
- Fugas de suscripción en los sensores de la integración.
- Correcciones críticas detectadas en revisión de código.

---

El historial anterior a 0.1.4 está disponible en
[GitHub Releases](https://github.com/AguacatecHA/HA_Companion/releases).

[0.1.5]: https://github.com/AguacatecHA/HA_Companion/releases/tag/v.0.1.5
[0.1.4]: https://github.com/AguacatecHA/HA_Companion/releases/tag/v.0.1.4
