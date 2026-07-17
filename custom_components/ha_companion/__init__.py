"""Watch Sensors Pro Integration."""
from __future__ import annotations
import logging
from datetime import timedelta

import aiohttp
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import label_registry as lr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

_LOGGER = logging.getLogger(__name__)
DOMAIN = "ha_companion"

VERSION_JSON_URL = (
    "https://raw.githubusercontent.com/AguacatecHA/HA_Companion/main/version.json"
)
VERSION_UPDATE_INTERVAL = timedelta(hours=1)


class VersionCoordinator(DataUpdateCoordinator):
    """Fetches the latest published app version from GitHub."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name="HA Companion published version",
            update_interval=VERSION_UPDATE_INTERVAL,
        )

    async def _async_update_data(self) -> dict:
        session = async_get_clientsession(self.hass)
        try:
            async with session.get(
                VERSION_JSON_URL,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                resp.raise_for_status()
                return await resp.json(content_type=None)
        except Exception as e:
            raise UpdateFailed(f"Could not fetch version.json: {e}") from e


class HACompanionAreasView(HomeAssistantView):
    """Expose the area registry (incl. icon) over REST for the watch app.

    HA only serves the area registry over the WebSocket API, and the Zepp
    watch companion (app-side) can only do HTTP fetch — so we bridge it here:
    GET /api/ha_companion/areas -> [{area_id, name, icon}, ...]
    """

    url = "/api/ha_companion/areas"
    name = "api:ha_companion:areas"
    requires_auth = True

    async def get(self, request):
        """Return all areas with icon + the user-assigned temp/humidity sensors."""
        hass = request.app["hass"]
        area_reg = ar.async_get(hass)
        # temperature_entity_id / humidity_entity_id exist on the area registry
        # since HA 2024.6; getattr keeps this working on older cores (returns None).
        areas = [
            {
                "area_id": area.id,
                "name": area.name,
                "icon": area.icon,
                "temperature_entity_id": getattr(area, "temperature_entity_id", None),
                "humidity_entity_id": getattr(area, "humidity_entity_id", None),
            }
            for area in area_reg.async_list_areas()
        ]
        return self.json(areas)


class HACompanionLabelsView(HomeAssistantView):
    """Expose the label registry (incl. icon + color) over REST for the watch.

    Like areas, HA only serves the label registry over the WebSocket API, and the
    watch app-side can only do HTTP — so we bridge it here:
    GET /api/ha_companion/labels -> [{label_id, name, icon, color}, ...]
    """

    url = "/api/ha_companion/labels"
    name = "api:ha_companion:labels"
    requires_auth = True

    async def get(self, request):
        """Return all labels with their assigned icon (mdi:... or null) and color."""
        hass = request.app["hass"]
        label_reg = lr.async_get(hass)
        labels = [
            {"label_id": lbl.label_id, "name": lbl.name, "icon": lbl.icon, "color": lbl.color}
            for lbl in label_reg.async_list_labels()
        ]
        return self.json(labels)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA Companion from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Register the areas REST bridge once per HA instance.
    if not hass.data[DOMAIN].get("areas_view_registered"):
        hass.http.register_view(HACompanionAreasView())
        hass.data[DOMAIN]["areas_view_registered"] = True

    # Register the labels REST bridge once per HA instance.
    if not hass.data[DOMAIN].get("labels_view_registered"):
        hass.http.register_view(HACompanionLabelsView())
        hass.data[DOMAIN]["labels_view_registered"] = True

    # Coordinator is shared — create it only once per HA instance
    if "version_coordinator" not in hass.data[DOMAIN]:
        coordinator = VersionCoordinator(hass)
        await coordinator.async_refresh()  # non-blocking: fails gracefully on first run
        hass.data[DOMAIN]["version_coordinator"] = coordinator

    hass.data[DOMAIN][entry.entry_id] = entry.data

    # Create the master sensor if the watch hasn't sent data yet
    username = entry.data["username"]
    master_sensor_id = f"sensor.{username}"
    if hass.states.get(master_sensor_id) is None:
        hass.states.async_set(
            master_sensor_id,
            "unknown",
            {"friendly_name": f"{username.capitalize()} Watch", "unit_of_measurement": "%"},
        )
        _LOGGER.info(f"Created placeholder master sensor: {master_sensor_id}")

    await hass.config_entries.async_forward_entry_setups(entry, ["sensor", "binary_sensor", "device_tracker"])
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, ["sensor", "binary_sensor", "device_tracker"])
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
