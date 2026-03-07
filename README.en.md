# ⌚ HA Companion Integration ⌚
>🌐 [Spanish Version](README.md)

## What can the HA Companion Integration do?

«HA Companion» is a component for [Home Assistant](https://home-assistant.io/) that allows you to retrieve and organize health data from your Amazfit/Zepp smartwatch directly into your Home Assistant instance, with the HA Companion app installed on your watch, displaying more than 40 health, activity, sleep and device status metrics.

---

## Installation

### Via HACS (Recommended)

To install the component using HACS:

1. Click the three dots in the top right corner of the HACS menu.
2. Select **Custom Repositories**.
3. Add the repository URL: `https://github.com/AguacatecHA/HA_Companion`.
4. Select the type: **Integration**.
5. Click the **Add** button.

<details>
<summary>Without HACS</summary>

1. Download the latest release of the HA Companion integration from **[GitHub Releases](https://github.com/AguacatecHA/HA_Companion/releases)**.
2. Extract the files and place the `ha_companion` folder into the `custom_components` folder of your Home Assistant (usually located at `config/custom_components`).
3. Restart your Home Assistant to load the new integration.

</details>

---

## Configuration

To add the integration to your Home Assistant instance, use the button:

<p>
    <a href="https://my.home-assistant.io/redirect/config_flow_start?domain=ha_companion" class="my badge" target="_blank">
        <img src="https://my.home-assistant.io/badges/config_flow_start.svg">
    </a>
</p>

### Manual Configuration

Once installed, go to _Devices & Services → Add Integration_ and search for _HA Companion_.

<img width="559" height="196" alt="image" src="https://github.com/user-attachments/assets/0a4c8e04-3949-4696-932e-dd8f4d8183c2" />

The wizard will ask for the username you have set in your Zepp HA Companion app.

<img width="435" height="241" alt="image" src="https://github.com/user-attachments/assets/30f41782-7c94-42f2-81f6-a7cbbb2d4d4f" />

Once configured, you will have the integration with all your watch sensors. If they appear as unavailable, just use the app on your watch and they will appear like magic. ✨

<img width="370" height="1094" alt="image" src="https://github.com/user-attachments/assets/2fec4a6d-79a8-4f14-9090-fb7886595e59" />

---

## Available Sensors

Once configured, you will have a device with sensors organized into the following categories:

### 🫀 Health

| Sensor | Description |
|---|---|
| Heart Rate | Beats per minute |
| Resting Heart Rate | Average resting heart rate for the day |
| Maximum Heart Rate | Peak heart rate reached during the day |
| Blood Oxygen (SpO2) | Oxygen saturation percentage |
| Stress | Stress level index (0–100) |
| Body Temperature | Temperature in °C |
| VO2 Max | Maximum oxygen consumption (ml/kg/min) |

### 😴 Sleep

| Sensor | Description |
|---|---|
| Sleep Status | Current sleep cycle status |
| Sleep Mode | Indicates whether sleep mode is enabled |
| Sleep Score | Overall sleep quality score |
| Total Sleep Time | Total sleep duration in hours/minutes |
| Deep Sleep | Duration of the deep sleep phase |
| Deep Sleep Time | Accumulated time in deep sleep |
| Light Sleep | Duration of the light sleep phase |
| REM Sleep | Duration of the REM phase |
| Awake Time | Time spent awake during the night |
| Sleep Time | Time at which sleep started |
| Wake-Up Time | Time at which wake-up was detected |

### 🏃 Activity

| Sensor | Description |
|---|---|
| Steps | Daily step counter |
| Calories | Calories burned during the day |
| Distance | Distance traveled in km |
| Standing Hours | Active / standing hours during the day |
| Fat Burn | Estimated fat burned (g) |
| Total PAI | Accumulated Personal Activity Intelligence index |
| PAI Score | PAI score for the current period |

### 🏋️ Workouts

| Sensor | Description |
|---|---|
| Number of Workouts | Total recorded sessions |
| Training Load | Accumulated training load |
| Last Workout Duration | Duration of the last session |
| Last Workout Date | Date and time of the last workout |
| Last Sport Type | Sport type of the last workout |

### 🌍 Environment

| Sensor | Description |
|---|---|
| Altitude | Current altitude in meters |
| Atmospheric Pressure | Pressure in hPa |

### ⌚ Device Status

| Sensor | Description |
|---|---|
| Battery | Remaining battery percentage |
| Watch Status | General watch connection status |
| Power Saving Mode | Indicates whether power saving mode is active |
| Ultra Power Saving Mode | Indicates whether ultra power saving mode is active |
| Theater Mode | Indicates whether theater mode is enabled |
| Do Not Disturb | Indicates whether Do Not Disturb mode is active |
| Firmware Version | Current firmware version of the watch |

### 🔧 Diagnostics

| Sensor | Description |
|---|---|
| Height | User height in cm (profile) |
| Weight | User weight in kg (profile) |
| Age | User age (profile) |
| Gender | User gender (profile) |
| Region | Region configured in the app |
| Minimum API | Minimum required API version |
| Daily Step Goal | Configured step goal |
| Calorie Goal | Configured calorie goal |
| Standing Hours Goal | Configured standing hours goal |
| Fat Burn Goal | Configured fat burn goal |
