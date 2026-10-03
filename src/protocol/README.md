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
- `connect`, `disconnect`, `error`, `message`, `reconnect`, `reconnectFailed`, `offline`

**Methods:**
- `connect()`: Establish MQTT connection
- `disconnect()`: Close connection
- `subscribe(topic)`: Subscribe to topic
- `publish(topic, payload)`: Publish message

### messageCodec.ts
Decodes device state and provides value conversions for commands.

**Conversions:**
- Fan speed: HomeKit percentage (0-100) ↔ Dyson speed (1-10, -1 for auto)
- Temperature: Celsius ↔ Kelvin × 10
- Filter life: hours (Link models) or percent → percent

Commands are built by `DysonLinkDevice`, which uses the codec's
`encodeFanSpeed` / `encodeTemperature` helpers.

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
