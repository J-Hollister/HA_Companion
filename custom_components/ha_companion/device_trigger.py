"""Device triggers for HA Companion.

The watch knows things no sensor in the house can: that you fell asleep, that you
woke up, that you took it off. Until now using any of that meant knowing the
entity_id by heart — and those ids are built from the TRANSLATED name, so they
differ per language and per install. Device triggers put the same thing in the
UI dropdown: pick the watch, pick "I fell asleep", done.
"""
from __future__ import annotations

import voluptuous as vol

from homeassistant.components.device_automation import DEVICE_TRIGGER_BASE_SCHEMA
from homeassistant.components.device_automation.exceptions import (
    InvalidDeviceAutomationConfig,
)
from homeassistant.components.homeassistant.triggers import (
    numeric_state as numeric_state_trigger,
    state as state_trigger,
)

# Los esquemas de las plataformas base no se llaman igual ni son públicos por
# igual: `state` expone TRIGGER_STATE_SCHEMA y TRIGGER_ATTRIBUTE_SCHEMA, y
# `numeric_state` solo _TRIGGER_SCHEMA, con guion bajo. Se resuelven aquí, con
# alternativa, para que un cambio de nombre en Home Assistant no deje la
# integración sin disparadores de golpe.
_ESQUEMA_ESTADO = getattr(state_trigger, "TRIGGER_STATE_SCHEMA", None) or \
    getattr(state_trigger, "TRIGGER_SCHEMA")
_ESQUEMA_ATRIBUTO = getattr(state_trigger, "TRIGGER_ATTRIBUTE_SCHEMA", None) or \
    _ESQUEMA_ESTADO
_ESQUEMA_NUMERICO = getattr(numeric_state_trigger, "_TRIGGER_SCHEMA", None) or \
    getattr(numeric_state_trigger, "TRIGGER_SCHEMA")
from homeassistant.const import (
    CONF_ABOVE,
    CONF_BELOW,
    CONF_DEVICE_ID,
    CONF_DOMAIN,
    CONF_ENTITY_ID,
    CONF_FOR,
    CONF_PLATFORM,
    CONF_TYPE,
    STATE_OFF,
    STATE_ON,
)
from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.helpers.trigger import TriggerActionType, TriggerInfo
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN

# tipo -> (clave del sensor, estado de partida, estado de llegada)
#
# La clave es la del catálogo SENSORS, no el entity_id: el id sale del nombre
# traducido y cambia con el idioma, mientras que el unique_id (`<ULID>_<clave>`)
# es estable. Se resuelve contra el registro en async_get_triggers.
ESTADOS: dict[str, tuple[str, str | None, str]] = {
    "fell_asleep":       ("is_sleeping",  STATE_OFF, STATE_ON),
    "woke_up":           ("is_sleeping",  STATE_ON,  STATE_OFF),
    "started_moving":    ("is_moving",    STATE_OFF, STATE_ON),
    "stopped_moving":    ("is_moving",    STATE_ON,  STATE_OFF),
    "charging_started":  ("is_charging",  STATE_OFF, STATE_ON),
    "charging_stopped":  ("is_charging",  STATE_ON,  STATE_OFF),
    "watch_worn":        ("wear",         None,      "is_wearing"),
    "watch_removed":     ("wear",         "is_wearing", "not_wearing"),
    "update_available":  ("update_pending", STATE_OFF, STATE_ON),
}

# tipo -> (clave, umbral)
NUMERICOS: dict[str, tuple[str, int]] = {
    "battery_low": ("battery", 20),
}

# tipo -> (clave, atributo, valor)
ATRIBUTOS: dict[str, tuple[str, str, bool]] = {
    "sync_lost": ("sync_age", "is_stale", True),
}

TRIGGER_TYPES = set(ESTADOS) | set(NUMERICOS) | set(ATRIBUTOS)

TRIGGER_SCHEMA = DEVICE_TRIGGER_BASE_SCHEMA.extend(
    {
        vol.Required(CONF_TYPE): vol.In(TRIGGER_TYPES),
        # entity_id_or_uuid, no entity_id: la interfaz puede guardar el id del
        # registro en vez del entity_id. Y es opcional a propósito, ver _resolver.
        vol.Optional(CONF_ENTITY_ID): cv.entity_id_or_uuid,
        vol.Optional(CONF_FOR): cv.positive_time_period_dict,
    }
)


def _por_clave(hass: HomeAssistant, device_id: str) -> dict[str, str]:
    """Mapa clave -> entity_id de un dispositivo, leído del registro."""
    registro = er.async_get(hass)
    salida: dict[str, str] = {}
    for entrada in er.async_entries_for_device(registro, device_id, include_disabled_entities=True):
        if entrada.platform != DOMAIN:
            continue
        # unique_id es "<entry_id>_<clave>"; partition corta por el PRIMER "_",
        # que es justo el que separa el ULID de la clave.
        clave = entrada.unique_id.partition("_")[2]
        if clave:
            salida[clave] = entrada.entity_id
    return salida


async def async_get_triggers(hass: HomeAssistant, device_id: str) -> list[dict]:
    """Enumerate the triggers this watch can actually offer.

    Only those whose backing entity exists: a watch that never reports wear
    should not offer "I took the watch off".
    """
    claves = _por_clave(hass, device_id)
    base = {
        CONF_PLATFORM: "device",
        CONF_DOMAIN: DOMAIN,
        CONF_DEVICE_ID: device_id,
    }
    disparadores = []
    for tipo, (clave, _desde, _hasta) in ESTADOS.items():
        if clave in claves:
            disparadores.append({**base, CONF_TYPE: tipo, CONF_ENTITY_ID: claves[clave]})
    for tipo, (clave, _umbral) in NUMERICOS.items():
        if clave in claves:
            disparadores.append({**base, CONF_TYPE: tipo, CONF_ENTITY_ID: claves[clave]})
    for tipo, (clave, _attr, _valor) in ATRIBUTOS.items():
        if clave in claves:
            disparadores.append({**base, CONF_TYPE: tipo, CONF_ENTITY_ID: claves[clave]})
    return disparadores


def _clave_de(tipo: str) -> str:
    """Qué sensor hay detrás de cada tipo de disparador."""
    if tipo in ESTADOS:
        return ESTADOS[tipo][0]
    if tipo in NUMERICOS:
        return NUMERICOS[tipo][0]
    return ATRIBUTOS[tipo][0]


def _resolver(hass: HomeAssistant, config: ConfigType) -> str:
    """Averigua sobre qué entidad va el disparador.

    `entity_id` no siempre viene, y cuando viene no siempre es un entity_id: la
    interfaz puede guardar el identificador del registro. Y un disparador escrito
    a mano puede traer solo el dispositivo y el tipo, que es información
    suficiente. Se aceptan los tres casos en vez de dar por hecho el primero.
    """
    crudo = config.get(CONF_ENTITY_ID)
    if crudo:
        registro = er.async_get(hass)
        return er.async_validate_entity_id(registro, crudo)
    claves = _por_clave(hass, config[CONF_DEVICE_ID])
    entity_id = claves.get(_clave_de(config[CONF_TYPE]))
    if not entity_id:
        raise InvalidDeviceAutomationConfig(
            f"El reloj no tiene la entidad que necesita el disparador "
            f"'{config[CONF_TYPE]}'"
        )
    return entity_id


async def async_attach_trigger(
    hass: HomeAssistant,
    config: ConfigType,
    action: TriggerActionType,
    trigger_info: TriggerInfo,
) -> CALLBACK_TYPE:
    """Wire the chosen trigger onto the plain state/numeric_state platforms."""
    tipo = config[CONF_TYPE]
    entity_id = _resolver(hass, config)

    if tipo in NUMERICOS:
        _clave, umbral = NUMERICOS[tipo]
        cfg = _ESQUEMA_NUMERICO(
            {
                CONF_PLATFORM: "numeric_state",
                CONF_ENTITY_ID: [entity_id],
                CONF_BELOW: umbral,
            }
        )
        return await numeric_state_trigger.async_attach_trigger(
            hass, cfg, action, trigger_info, platform_type="device"
        )

    if tipo in ATRIBUTOS:
        _clave, atributo, valor = ATRIBUTOS[tipo]
        base = {
            CONF_PLATFORM: "state",
            CONF_ENTITY_ID: [entity_id],
            "attribute": atributo,
            "to": valor,
        }
        if CONF_FOR in config:
            base[CONF_FOR] = config[CONF_FOR]
        cfg = _ESQUEMA_ATRIBUTO(base)
        return await state_trigger.async_attach_trigger(
            hass, cfg, action, trigger_info, platform_type="device"
        )

    _clave, desde, hasta = ESTADOS[tipo]
    base = {
        CONF_PLATFORM: "state",
        CONF_ENTITY_ID: [entity_id],
        "to": hasta,
    }
    # `from` se omite cuando no aporta: con él, un reloj que arranca en
    # "unknown" no dispararía la primera vez.
    if desde is not None:
        base["from"] = desde
    if CONF_FOR in config:
        base[CONF_FOR] = config[CONF_FOR]
    cfg = _ESQUEMA_ESTADO(base)
    return await state_trigger.async_attach_trigger(
        hass, cfg, action, trigger_info, platform_type="device"
    )
