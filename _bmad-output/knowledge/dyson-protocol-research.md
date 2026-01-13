# Dyson Protocol Research

**Date:** 2025-01-13
**Agent:** Analyst (Alex)
**Workflow:** research-dyson

---

## Executive Summary

Dyson WiFi-enabled devices communicate via **local MQTT protocol**. Each device runs an embedded MQTT broker on port 1883, and clients (like our plugin) connect as subscribers/publishers. Authentication requires device-specific credentials obtained from the Dyson cloud API.

---

## 1. Device Discovery

### mDNS/Bonjour Service
- **Service Type:** `_dyson_mqtt._tcp`
- **Port:** 1883
- Devices broadcast their presence on the local network
- Device serial number is part of the service name

### Device Identification
- **Serial Number:** Unique identifier (found on device label)
- **Product Type:** Numeric code identifying device model (e.g., 438 = TP04)
- **WiFi Credentials:** SSID/password on device sticker (pre-2020 models)

### Authentication Requirements
1. **Cloud API Authentication:** Login to Dyson account to retrieve device list
2. **Local MQTT Credentials:** Hashed password derived from device password
   - Base64-encoded SHA-512 hash of device password
   - Password found on device label/sticker
3. **Two-Factor Auth:** May require manual credential entry

---

## 2. Communication Protocol

### MQTT Architecture
```
┌──────────────────┐         MQTT          ┌──────────────────┐
│   Homebridge     │ ◄──────────────────► │   Dyson Device   │
│   Plugin         │      Port 1883        │   (MQTT Broker)  │
│   (Client)       │                       │                  │
└──────────────────┘                       └──────────────────┘
```

### MQTT Topics

| Direction | Topic Pattern | Purpose |
|-----------|---------------|---------|
| Subscribe | `{productType}/{serial}/status/current` | Receive state updates |
| Publish | `{productType}/{serial}/command` | Send commands |

### Message Format

```json
{
  "msg": "STATE-SET",
  "time": "2025-01-13T10:30:00.000Z",
  "mode-reason": "LAPP",
  "data": {
    "fmod": "FAN",
    "fnsp": "0005"
  }
}
```

### Key Message Types
- `CURRENT-STATE` - Device state response
- `STATE-SET` - Command to change state
- `STATE-CHANGE` - Pushed state update
- `ENVIRONMENTAL-CURRENT-SENSOR-DATA` - Sensor readings

### Connection Lifecycle
1. Connect to device MQTT broker with credentials
2. Subscribe to status topic
3. Request initial state
4. Listen for state changes
5. Send commands as needed
6. **Important:** Must publish commands every ~30 seconds to keep receiving updates

### Known Issues
- Connection limit on MQTT broker
- Firmware bug on TP07, TP09, HP07, HP09 causing dead connection accumulation
- Requires reconnection logic with backoff

---

## 3. Device Capabilities by Model

### Product Type Codes

| Code | Model | Features |
|------|-------|----------|
| 358 | PH01 (Pure Humidify+Cool) | Fan, Humidity, Air Quality |
| 438 | TP04 (Pure Cool Tower) | Fan, Air Quality |
| 438E | TP07 (Purifier Cool) | Fan, Air Quality, HEPA |
| 455 | TP02 (Pure Cool Link Tower) | Fan, Air Quality |
| 469 | BP01 (Pure Cool Me) | Fan (personal) |
| 475 | DP04 (Pure Cool Desk) | Fan, Air Quality |
| 520 | PH03/PH04 (Purifier Humidify+Cool) | Fan, Humidity, Air Quality |
| 527 | HP04 (Pure Hot+Cool) | Fan, Heat, Air Quality |
| 527E | HP07 (Purifier Hot+Cool) | Fan, Heat, Air Quality |
| 664 | BP03-06 (Big+Quiet) | Fan, Air Quality, Large room |

### Feature Matrix

| Model Series | Fan | Heat | Humidity | AQ Sensors | Oscillation | Night Mode |
|--------------|-----|------|----------|------------|-------------|------------|
| TP (Cool) | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| HP (Hot+Cool) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| PH (Humidify) | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| DP (Desk) | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| BP (Big+Quiet) | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## 4. State and Commands

### Fan Control

| Field | Values | Description |
|-------|--------|-------------|
| `fpwr` | ON, OFF | Fan power |
| `fmod` | OFF, FAN, AUTO | Fan mode |
| `fnsp` | 0001-0010, AUTO | Fan speed (1-10 or auto) |
| `oson` | ON, OFF | Oscillation |
| `oscs` | 0045-0355 | Oscillation start angle |
| `osce` | 0045-0355 | Oscillation end angle |
| `nmod` | ON, OFF | Night mode |
| `rhtm` | ON, OFF | Continuous monitoring |
| `ffoc` | ON, OFF | Jet focus (airflow direction) |

### Heating Control (HP models)

| Field | Values | Description |
|-------|--------|-------------|
| `hmod` | HEAT, OFF | Heating mode |
| `hmax` | 2740-3100 | Target temp (Kelvin × 10) |

### Humidity Control (PH models)

| Field | Values | Description |
|-------|--------|-------------|
| `hume` | ON, OFF, AUTO | Humidification |
| `humt` | 30-70 | Target humidity % |
| `rect` | ON, OFF | Auto humidification |

### Environmental Sensors

| Field | Description | Unit Conversion |
|-------|-------------|-----------------|
| `tact` | Temperature | (value/10) - 273.15 = °C |
| `hact` | Humidity | Direct % |
| `pact` | Particulate (PM2.5) | Direct µg/m³ |
| `vact` | VOC index | Index value (not µg/m³) |
| `noxl` | NO2 level | Index value |
| `pm25` | PM2.5 | Direct µg/m³ |
| `pm10` | PM10 | Direct µg/m³ |

### Filter Status

| Field | Description |
|-------|-------------|
| `filf` | Filter life remaining (hours) |
| `fltf` | HEPA filter life % |
| `cflr` | Carbon filter life % |

---

## 5. Existing Implementations

### Homebridge Plugins

| Plugin | Status | Notes |
|--------|--------|-------|
| [homebridge-dyson-pure-cool](https://github.com/lukasroegner/homebridge-dyson-pure-cool) | Active, Verified | Most popular, 16 models |
| [homebridge-dyson-link](https://github.com/joe-ng/homebridge-dyson-link) | Hobby project | Older implementation |
| [homebridge-dyson-fan](https://www.npmjs.com/package/homebridge-dyson-fan) | Unmaintained | 8 years old |

### Home Assistant

| Integration | Status | Notes |
|-------------|--------|-------|
| [ha-dyson](https://github.com/libdyson-wg/ha-dyson) | Active | MQTT-based, good protocol reference |
| [libdyson-wg](https://github.com/libdyson-wg) | Active | Maintained working group |

### Other

| Project | Language | Notes |
|---------|----------|-------|
| [ioBroker.dysonairpurifier](https://github.com/Grizzelbee/ioBroker.dysonairpurifier) | JavaScript | Active, good docs |
| libpurecool | Python | Reference implementation |

---

## 6. Key Takeaways for Implementation

### Must Have
1. **Credential retrieval** from Dyson cloud API (one-time or cached)
2. **MQTT client** for local device communication
3. **mDNS discovery** for finding devices
4. **Reconnection logic** with exponential backoff
5. **Keep-alive mechanism** (poll every ~30 seconds)

### Should Have
1. **Manual credential entry** for 2FA users
2. **IP address configuration** as fallback to discovery
3. **Device caching** to survive restarts

### Nice to Have
1. **Automatic credential refresh** from cloud
2. **Multiple device support** with parallel connections

### Challenges
1. MQTT broker connection limits
2. Firmware bugs causing connection pool exhaustion
3. Two-factor authentication complexity
4. Different protocol versions across device generations

---

## Sources

- [Home Assistant Dyson Local MQTT Control](https://community.home-assistant.io/t/dyson-pure-cool-link-local-mqtt-control/217263)
- [ha-dyson GitHub](https://github.com/libdyson-wg/ha-dyson)
- [homebridge-dyson-pure-cool GitHub](https://github.com/lukasroegner/homebridge-dyson-pure-cool)
- [ioBroker.dysonairpurifier GitHub](https://github.com/Grizzelbee/ioBroker.dysonairpurifier)
- [Dyson Fan Control over MQTT](https://devopstar.com/2019/03/03/dyson-fan-control-over-mqtt-via-serverless/)
