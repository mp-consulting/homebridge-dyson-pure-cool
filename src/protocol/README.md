# Protocol

MQTT communication protocol - Low-level device communication with Dyson devices.

## Structure

```
protocol/
├── index.ts          # Module exports
├── mqttClient.ts     # MQTT client wrapper
└── messageCodec.ts   # Message encoding/decoding
```

## Files

### mqttClient.ts
MQTT client wrapper for Dyson devices.

**Options:**
- `host`, `serial`, `credentials`, `productType`
- `timeout`: Connection timeout (default: 10000 ms)
- `keepalive`: Keep-alive interval (default: 30 seconds)
- `autoReconnect`: Enable auto-reconnect (default: true)
- `maxReconnectAttempts`: Max reconnection tries (default: 5)

**Events:**
- `connect`, `disconnect`, `error`, `message`

**Methods:**
- `connect()`: Establish MQTT connection
- `disconnect()`: Close connection
- `subscribe(topic)`: Subscribe to topic
- `publish(topic, payload)`: Publish message

### messageCodec.ts
Encodes HomeKit commands to Dyson protocol and decodes device state.

**Conversions:**
- Fan speed: HomeKit percentage (0-100) ↔ Dyson speed (1-10, -1 for auto)
- Temperature: Celsius ↔ Kelvin × 10
- Oscillation angle: Degrees (45-355)

**Command Types:**
- Power, speed, oscillation
- Auto mode, night mode, continuous monitoring
- Target temperature (heating)
- Target humidity (humidifier)
- Jet focus, sleep timer

**State Decoding:**
- Power state, fan speed, oscillation settings
- Sensor readings (temperature, humidity)
- Air quality (PM2.5, PM10, VOC, NO2)
- Filter life remaining
- Error and warning codes

## Protocol Details

Dyson devices communicate via local MQTT on port 1883. The device acts as an MQTT broker, and the plugin connects as a client using credentials obtained from the Dyson cloud or manual configuration.

**Topics:**
- Command topic: `{productType}/{serial}/command`
- Status topic: `{productType}/{serial}/status/current`
