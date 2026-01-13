# Architecture Document
## homebridge-dyson-pure-cool

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2025-01-13 |
| **Author** | Architect Agent (Morgan) |
| **Status** | Draft |

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Apple HomeKit                               │
└─────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ HAP Protocol
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Homebridge                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    homebridge-dyson-pure-cool                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│  │  │  Platform   │  │ Accessories │  │    Device Manager       │   │  │
│  │  │   Plugin    │◄►│   Handler   │◄►│  ┌─────┐ ┌─────┐       │   │  │
│  │  └─────────────┘  └─────────────┘  │  │Dev 1│ │Dev 2│ ...   │   │  │
│  │                                     │  └──┬──┘ └──┬──┘       │   │  │
│  │                                     └─────┼───────┼──────────┘   │  │
│  └───────────────────────────────────────────┼───────┼──────────────┘  │
└──────────────────────────────────────────────┼───────┼──────────────────┘
                                               │ MQTT  │ MQTT
                                               ▼       ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│     Dyson Device 1      │         │     Dyson Device 2      │
│    (MQTT Broker:1883)   │         │    (MQTT Broker:1883)   │
└─────────────────────────┘         └─────────────────────────┘
```

### 1.2 Component Relationships

```
┌──────────────────────────────────────────────────────────────────┐
│                         Platform Layer                            │
│  ┌────────────┐  ┌─────────────────┐  ┌────────────────────┐    │
│  │  index.ts  │─►│   platform.ts   │─►│ accessoryFactory.ts│    │
│  │  (entry)   │  │ (orchestrator)  │  │  (creates accs)    │    │
│  └────────────┘  └────────┬────────┘  └────────────────────┘    │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                           ▼         Accessory Layer               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                  DysonPureCoolAccessory                      │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │ │
│  │  │  Fanv2   │ │  Temp    │ │ Humidity │ │  AirQuality  │   │ │
│  │  │ Service  │ │ Sensor   │ │  Sensor  │ │   Sensor     │   │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                           ▼         Device Layer                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                     DysonDevice                              │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │ │
│  │  │ MqttClient   │ │  Protocol    │ │   DeviceState      │  │ │
│  │  │ (connection) │ │  (encoding)  │ │   (state mgmt)     │  │ │
│  │  └──────────────┘ └──────────────┘ └────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                           ▼         Discovery Layer               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │  DysonCloudApi   │  │   MdnsDiscovery  │  │ CredentialMgr  │ │
│  │  (get devices)   │  │  (find on LAN)   │  │ (store creds)  │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. INITIALIZATION                                                    │
│    Config ──► Cloud API ──► Device List ──► mDNS ──► IP Addresses   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. CONNECTION                                                        │
│    Credentials ──► MQTT Connect ──► Subscribe ──► Initial State     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. RUNTIME                                                           │
│    ┌────────────────────────────────────────────────────────────┐   │
│    │  HomeKit ──► Command ──► MQTT Publish ──► Device           │   │
│    │  Device ──► State Change ──► MQTT ──► Update HomeKit       │   │
│    └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
src/
├── index.ts                    # Plugin entry point
├── platform.ts                 # DynamicPlatformPlugin implementation
├── settings.ts                 # Constants (PLATFORM_NAME, PLUGIN_NAME)
├── config.ts                   # Configuration types and validation
│
├── accessories/
│   ├── index.ts                # Accessory exports
│   ├── dysonAccessory.ts       # Base accessory class
│   ├── pureCoolAccessory.ts    # TP series accessory
│   ├── hotCoolAccessory.ts     # HP series accessory (extends pureCool)
│   └── services/
│       ├── fanService.ts       # Fanv2 service handler
│       ├── temperatureService.ts
│       ├── humidityService.ts
│       ├── airQualityService.ts
│       └── filterService.ts
│
├── devices/
│   ├── index.ts                # Device exports
│   ├── deviceManager.ts        # Manages all device connections
│   ├── dysonDevice.ts          # Base device class
│   ├── pureCoolDevice.ts       # TP series device
│   ├── hotCoolDevice.ts        # HP series device
│   └── types.ts                # Device type definitions
│
├── protocol/
│   ├── index.ts                # Protocol exports
│   ├── mqttClient.ts           # MQTT connection wrapper
│   ├── messageCodec.ts         # Encode/decode messages
│   ├── commands.ts             # Command builders
│   └── stateParser.ts          # Parse device state
│
├── discovery/
│   ├── index.ts                # Discovery exports
│   ├── cloudApi.ts             # Dyson cloud API client
│   ├── mdnsDiscovery.ts        # mDNS device discovery
│   └── credentialManager.ts    # Credential storage
│
└── utils/
    ├── index.ts                # Utility exports
    ├── logger.ts               # Logging wrapper
    ├── retry.ts                # Retry with backoff
    └── conversions.ts          # Unit conversions

test/
├── unit/
│   ├── protocol/
│   │   ├── messageCodec.test.ts
│   │   └── stateParser.test.ts
│   └── utils/
│       └── conversions.test.ts
├── integration/
│   ├── device.test.ts
│   └── platform.test.ts
└── mocks/
    ├── mockDevice.ts
    ├── mockMqtt.ts
    └── mockHomebridge.ts
```

---

## 3. Component Architecture

### 3.1 Platform Plugin Core

#### index.ts
```typescript
// Entry point - registers platform with Homebridge
import { API } from 'homebridge';
import { DysonPureCoolPlatform } from './platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, DysonPureCoolPlatform);
};
```

#### platform.ts
```typescript
// Main platform orchestrator
export class DysonPureCoolPlatform implements DynamicPlatformPlugin {
  private readonly deviceManager: DeviceManager;
  private readonly accessories: Map<string, PlatformAccessory> = new Map();

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.deviceManager = new DeviceManager(config, log);

    api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  async discoverDevices(): Promise<void> {
    // 1. Get device list from cloud or config
    // 2. Discover IPs via mDNS
    // 3. Connect to each device
    // 4. Register accessories
  }

  configureAccessory(accessory: PlatformAccessory): void {
    // Restore cached accessory
  }
}
```

### 3.2 Accessory Layer

#### dysonAccessory.ts (Base Class)
```typescript
export abstract class DysonAccessory {
  protected readonly platform: DysonPureCoolPlatform;
  protected readonly accessory: PlatformAccessory;
  protected readonly device: DysonDevice;

  // Common services
  protected fanService: FanService;
  protected temperatureService: TemperatureService;
  protected humidityService: HumidityService;

  constructor(platform, accessory, device) {
    this.setupServices();
    this.device.on('stateChange', this.handleStateChange.bind(this));
  }

  protected abstract setupServices(): void;
  protected abstract handleStateChange(state: DeviceState): void;
}
```

#### pureCoolAccessory.ts
```typescript
export class PureCoolAccessory extends DysonAccessory {
  protected airQualityService: AirQualityService;

  protected setupServices(): void {
    this.fanService = new FanService(this.accessory, this.device);
    this.temperatureService = new TemperatureService(this.accessory, this.device);
    this.humidityService = new HumidityService(this.accessory, this.device);
    this.airQualityService = new AirQualityService(this.accessory, this.device);
  }
}
```

### 3.3 Device Layer

#### dysonDevice.ts
```typescript
export abstract class DysonDevice extends EventEmitter {
  protected readonly mqttClient: MqttClient;
  protected readonly codec: MessageCodec;
  protected state: DeviceState;

  abstract readonly productType: string;
  abstract readonly supportedFeatures: DeviceFeatures;

  async connect(): Promise<void> {
    await this.mqttClient.connect();
    await this.subscribeToState();
    await this.requestCurrentState();
  }

  async setFanSpeed(speed: number): Promise<void> {
    const command = this.codec.encodeFanSpeed(speed);
    await this.mqttClient.publish(this.commandTopic, command);
  }

  protected handleMessage(topic: string, payload: Buffer): void {
    const state = this.codec.decodeState(payload);
    this.state = { ...this.state, ...state };
    this.emit('stateChange', this.state);
  }
}
```

#### deviceManager.ts
```typescript
export class DeviceManager {
  private readonly devices: Map<string, DysonDevice> = new Map();
  private readonly discovery: MdnsDiscovery;
  private readonly cloudApi: DysonCloudApi;

  async discoverAndConnect(): Promise<DysonDevice[]> {
    // 1. Get device list from cloud API
    const deviceList = await this.cloudApi.getDevices();

    // 2. Discover local IPs
    const discoveredIps = await this.discovery.discover();

    // 3. Create and connect devices
    for (const info of deviceList) {
      const device = this.createDevice(info);
      await device.connect();
      this.devices.set(info.serial, device);
    }

    return Array.from(this.devices.values());
  }

  private createDevice(info: DeviceInfo): DysonDevice {
    switch (info.productType) {
      case '438':
      case '438E':
        return new PureCoolDevice(info);
      case '527':
      case '527E':
        return new HotCoolDevice(info);
      default:
        return new PureCoolDevice(info); // fallback
    }
  }
}
```

### 3.4 Protocol Layer

#### mqttClient.ts
```typescript
export class MqttClient extends EventEmitter {
  private client: mqtt.MqttClient | null = null;
  private readonly options: MqttClientOptions;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.options.brokerUrl, {
        username: this.options.serial,
        password: this.options.credentials,
        clientId: `homebridge_${this.options.serial}`,
        keepalive: 30,
        reconnectPeriod: 0, // We handle reconnection manually
      });

      this.client.on('connect', () => {
        this.reconnectAttempts = 0;
        resolve();
      });

      this.client.on('error', this.handleError.bind(this));
      this.client.on('close', this.handleDisconnect.bind(this));
      this.client.on('message', this.handleMessage.bind(this));
    });
  }

  private async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      this.reconnectAttempts++;
      await this.delay(delay);
      await this.connect();
    } else {
      this.emit('connectionFailed');
    }
  }
}
```

#### messageCodec.ts
```typescript
export class MessageCodec {
  encodeFanSpeed(speed: number): string {
    // Convert 0-100% to 0001-0010
    const dysonSpeed = Math.ceil(speed / 10).toString().padStart(4, '0');
    return JSON.stringify({
      msg: 'STATE-SET',
      time: new Date().toISOString(),
      'mode-reason': 'LAPP',
      data: { fnsp: dysonSpeed },
    });
  }

  decodeState(payload: Buffer): Partial<DeviceState> {
    const msg = JSON.parse(payload.toString());
    const data = msg.data || msg['product-state'];

    return {
      fanSpeed: this.decodeFanSpeed(data.fnsp),
      isOn: data.fpwr === 'ON',
      oscillation: data.oson === 'ON',
      nightMode: data.nmod === 'ON',
      autoMode: data.fmod === 'AUTO',
      temperature: this.decodeTemperature(data.tact),
      humidity: parseInt(data.hact, 10),
      // ... more fields
    };
  }

  private decodeTemperature(kelvinTimes10: string): number {
    // Convert Kelvin × 10 to Celsius
    return (parseInt(kelvinTimes10, 10) / 10) - 273.15;
  }

  private decodeFanSpeed(speed: string): number {
    if (speed === 'AUTO') return -1;
    return parseInt(speed, 10) * 10; // 0001 → 10%
  }
}
```

### 3.5 Discovery Layer

#### cloudApi.ts
```typescript
export class DysonCloudApi {
  private readonly baseUrl = 'https://appapi.cp.dyson.com';
  private authToken: string | null = null;

  async authenticate(email: string, password: string): Promise<void> {
    // Handle 2FA flow if needed
    const response = await axios.post(`${this.baseUrl}/v3/userregistration/email/auth`, {
      email,
      password,
    });
    this.authToken = response.data.token;
  }

  async getDevices(): Promise<DeviceInfo[]> {
    const response = await axios.get(`${this.baseUrl}/v2/provisioningservice/manifest`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });

    return response.data.map((device: any) => ({
      serial: device.Serial,
      productType: device.ProductType,
      name: device.Name,
      credentials: this.decryptCredentials(device.LocalCredentials),
    }));
  }
}
```

#### mdnsDiscovery.ts
```typescript
export class MdnsDiscovery {
  async discover(timeout = 10000): Promise<Map<string, string>> {
    const devices = new Map<string, string>();

    return new Promise((resolve) => {
      const bonjour = new Bonjour();
      const browser = bonjour.find({ type: 'dyson_mqtt' });

      browser.on('up', (service) => {
        // Service name format: {serial}_dyson_mqtt._tcp.local
        const serial = service.name.split('_')[0];
        devices.set(serial, service.addresses[0]);
      });

      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        resolve(devices);
      }, timeout);
    });
  }
}
```

---

## 4. Data Models

### 4.1 Core Types

```typescript
// src/devices/types.ts

export interface DeviceInfo {
  serial: string;
  productType: string;
  name: string;
  credentials: string;
  ipAddress?: string;
}

export interface DeviceState {
  // Power & Mode
  isOn: boolean;
  fanSpeed: number;          // 0-100 or -1 for auto
  oscillation: boolean;
  autoMode: boolean;
  nightMode: boolean;

  // Environmental
  temperature: number;       // Celsius
  humidity: number;          // 0-100%

  // Air Quality
  airQuality: AirQualityLevel;
  pm25: number;              // µg/m³
  pm10: number;              // µg/m³
  vocIndex: number;          // Index value
  no2Index: number;          // Index value

  // Filter
  filterLifePercent: number;
  filterLifeHours: number;

  // Connection
  connected: boolean;
  lastSeen: Date;
}

export enum AirQualityLevel {
  EXCELLENT = 1,
  GOOD = 2,
  FAIR = 3,
  INFERIOR = 4,
  POOR = 5,
}

export interface DeviceFeatures {
  hasFan: boolean;
  hasHeater: boolean;
  hasHumidifier: boolean;
  hasAirQuality: boolean;
  hasOscillation: boolean;
  hasNightMode: boolean;
  hasAutoMode: boolean;
}

export const PRODUCT_FEATURES: Record<string, DeviceFeatures> = {
  '438': { hasFan: true, hasHeater: false, hasHumidifier: false, hasAirQuality: true, hasOscillation: true, hasNightMode: true, hasAutoMode: true },
  '438E': { hasFan: true, hasHeater: false, hasHumidifier: false, hasAirQuality: true, hasOscillation: true, hasNightMode: true, hasAutoMode: true },
  '527': { hasFan: true, hasHeater: true, hasHumidifier: false, hasAirQuality: true, hasOscillation: true, hasNightMode: true, hasAutoMode: true },
  '527E': { hasFan: true, hasHeater: true, hasHumidifier: false, hasAirQuality: true, hasOscillation: true, hasNightMode: true, hasAutoMode: true },
  // ... more product types
};
```

### 4.2 Configuration Types

```typescript
// src/config.ts

export interface DysonPureCoolConfig extends PlatformConfig {
  // Authentication (optional if using manual device config)
  email?: string;
  password?: string;
  countryCode?: string;

  // Manual device configuration
  devices?: ManualDeviceConfig[];

  // Feature toggles
  enableAirQuality?: boolean;    // default: true
  enableTemperature?: boolean;   // default: true
  enableHumidity?: boolean;      // default: true
  enableFilterStatus?: boolean;  // default: true

  // Polling
  pollingInterval?: number;      // default: 60 seconds

  // Advanced
  discoveryTimeout?: number;     // default: 10000ms
  mqttTimeout?: number;          // default: 5000ms
}

export interface ManualDeviceConfig {
  serial: string;
  credentials: string;
  ipAddress: string;
  name?: string;
  productType?: string;
}

export function validateConfig(config: DysonPureCoolConfig): void {
  if (!config.email && !config.devices?.length) {
    throw new Error('Either email/password or manual device configuration required');
  }

  if (config.devices) {
    for (const device of config.devices) {
      if (!device.serial || !device.credentials || !device.ipAddress) {
        throw new Error('Manual device config requires serial, credentials, and ipAddress');
      }
    }
  }
}
```

---

## 5. Communication Flows

### 5.1 Initialization Flow

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌────────┐     ┌────────┐
│Homebridge│     │ Platform │     │ CloudApi  │     │  mDNS  │     │ Device │
└────┬────┘     └────┬─────┘     └─────┬─────┘     └───┬────┘     └───┬────┘
     │               │                 │               │               │
     │ didFinish     │                 │               │               │
     │──────────────►│                 │               │               │
     │               │                 │               │               │
     │               │ authenticate    │               │               │
     │               │────────────────►│               │               │
     │               │                 │               │               │
     │               │ getDevices      │               │               │
     │               │────────────────►│               │               │
     │               │                 │               │               │
     │               │ devices[]       │               │               │
     │               │◄────────────────│               │               │
     │               │                 │               │               │
     │               │ discover        │               │               │
     │               │─────────────────────────────────►               │
     │               │                 │               │               │
     │               │ serial→IP map   │               │               │
     │               │◄─────────────────────────────────               │
     │               │                 │               │               │
     │               │ connect         │               │               │
     │               │────────────────────────────────────────────────►│
     │               │                 │               │               │
     │               │ connected       │               │               │
     │               │◄────────────────────────────────────────────────│
     │               │                 │               │               │
     │ register      │                 │               │               │
     │◄──────────────│                 │               │               │
     │               │                 │               │               │
```

### 5.2 Command Flow (HomeKit → Device)

```
┌────────┐     ┌───────────┐     ┌──────────┐     ┌────────────┐     ┌────────┐
│ HomeKit │     │ FanService│     │ Device   │     │ MqttClient │     │ Dyson  │
└────┬───┘     └─────┬─────┘     └────┬─────┘     └─────┬──────┘     └───┬────┘
     │               │                 │                 │               │
     │ setFanSpeed   │                 │                 │               │
     │──────────────►│                 │                 │               │
     │               │                 │                 │               │
     │               │ setFanSpeed     │                 │               │
     │               │────────────────►│                 │               │
     │               │                 │                 │               │
     │               │                 │ encodeCommand   │               │
     │               │                 │─────────────────►               │
     │               │                 │                 │               │
     │               │                 │ publish         │               │
     │               │                 │─────────────────►               │
     │               │                 │                 │               │
     │               │                 │                 │ MQTT message  │
     │               │                 │                 │──────────────►│
     │               │                 │                 │               │
     │               │                 │                 │ ACK (implied) │
     │               │                 │◄────────────────│◄──────────────│
     │               │                 │                 │               │
     │               │ update state    │                 │               │
     │               │◄────────────────│                 │               │
     │               │                 │                 │               │
     │ callback      │                 │                 │               │
     │◄──────────────│                 │                 │               │
     │               │                 │                 │               │
```

### 5.3 State Update Flow (Device → HomeKit)

```
┌────────┐     ┌────────────┐     ┌──────────┐     ┌───────────┐     ┌────────┐
│ Dyson  │     │ MqttClient │     │ Device   │     │ Accessory │     │ HomeKit│
└───┬────┘     └─────┬──────┘     └────┬─────┘     └─────┬─────┘     └───┬────┘
    │                │                 │                 │               │
    │ state change   │                 │                 │               │
    │───────────────►│                 │                 │               │
    │                │                 │                 │               │
    │                │ message         │                 │               │
    │                │────────────────►│                 │               │
    │                │                 │                 │               │
    │                │                 │ decode          │               │
    │                │                 │─────────────────►               │
    │                │                 │                 │               │
    │                │                 │ emit stateChange│               │
    │                │                 │─────────────────►               │
    │                │                 │                 │               │
    │                │                 │                 │ update chars  │
    │                │                 │                 │──────────────►│
    │                │                 │                 │               │
```

---

## 6. Error Handling Strategy

### 6.1 Error Categories

| Category | Examples | Strategy |
|----------|----------|----------|
| **Authentication** | Invalid credentials, 2FA required | Fail fast, clear error message |
| **Discovery** | No devices found, mDNS timeout | Retry, use manual config fallback |
| **Connection** | MQTT connect failure, timeout | Retry with backoff, max 5 attempts |
| **Communication** | Message parse error, command fail | Log and continue, don't crash |
| **HomeKit** | Characteristic error | Return HAP error code |

### 6.2 Retry Strategy

```typescript
// src/utils/retry.ts

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        const delay = Math.min(
          initialDelay * Math.pow(backoffFactor, attempt - 1),
          maxDelay,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}
```

### 6.3 Graceful Degradation

```typescript
// When device disconnects, show as "Not Responding" in HomeKit
private handleDisconnection(): void {
  this.state.connected = false;

  // Update characteristics to show unavailable
  this.fanService.updateCharacteristic(
    this.platform.Characteristic.Active,
    new Error('Device offline'),
  );

  // Attempt reconnection in background
  this.scheduleReconnect();
}

// Cache last known state for quick recovery
private cacheState(): void {
  const cacheFile = path.join(this.storagePath, `${this.serial}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify(this.state));
}
```

### 6.4 Logging Strategy

```typescript
// src/utils/logger.ts

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  constructor(
    private readonly log: Logging,
    private readonly prefix: string,
    private readonly level: LogLevel = LogLevel.INFO,
  ) {}

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log.debug(`[${this.prefix}] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      this.log.info(`[${this.prefix}] ${message}`, ...args);
    }
  }

  // ... warn, error methods
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

```typescript
// test/unit/protocol/messageCodec.test.ts

describe('MessageCodec', () => {
  let codec: MessageCodec;

  beforeEach(() => {
    codec = new MessageCodec();
  });

  describe('encodeFanSpeed', () => {
    it('should encode 50% as 0005', () => {
      const message = codec.encodeFanSpeed(50);
      const parsed = JSON.parse(message);
      expect(parsed.data.fnsp).toBe('0005');
    });

    it('should encode 100% as 0010', () => {
      const message = codec.encodeFanSpeed(100);
      const parsed = JSON.parse(message);
      expect(parsed.data.fnsp).toBe('0010');
    });
  });

  describe('decodeTemperature', () => {
    it('should convert Kelvin×10 to Celsius', () => {
      // 2950 = 295K = 21.85°C
      expect(codec.decodeTemperature('2950')).toBeCloseTo(21.85, 1);
    });
  });
});
```

### 7.2 Integration Tests

```typescript
// test/integration/device.test.ts

describe('DysonDevice Integration', () => {
  let device: PureCoolDevice;
  let mockMqtt: MockMqttBroker;

  beforeEach(async () => {
    mockMqtt = new MockMqttBroker();
    await mockMqtt.start();

    device = new PureCoolDevice({
      serial: 'TEST-SERIAL',
      productType: '438',
      credentials: 'test-creds',
      ipAddress: '127.0.0.1',
    });

    await device.connect();
  });

  afterEach(async () => {
    await device.disconnect();
    await mockMqtt.stop();
  });

  it('should receive state updates', async () => {
    const statePromise = new Promise<DeviceState>((resolve) => {
      device.once('stateChange', resolve);
    });

    mockMqtt.publishState({ fnsp: '0005', fpwr: 'ON' });

    const state = await statePromise;
    expect(state.fanSpeed).toBe(50);
    expect(state.isOn).toBe(true);
  });
});
```

### 7.3 Mock Implementations

```typescript
// test/mocks/mockDevice.ts

export class MockDysonDevice extends EventEmitter implements DysonDevice {
  state: DeviceState = {
    isOn: false,
    fanSpeed: 0,
    oscillation: false,
    // ... defaults
  };

  async connect(): Promise<void> {
    // Simulate connection
  }

  async setFanSpeed(speed: number): Promise<void> {
    this.state.fanSpeed = speed;
    this.emit('stateChange', this.state);
  }

  simulateStateChange(partial: Partial<DeviceState>): void {
    this.state = { ...this.state, ...partial };
    this.emit('stateChange', this.state);
  }
}
```

---

## 8. Configuration Schema

### 8.1 config.schema.json

```json
{
  "pluginAlias": "DysonPureCool",
  "pluginType": "platform",
  "singular": true,
  "headerDisplay": "Homebridge plugin for Dyson Pure Cool air purifiers and fans",
  "schema": {
    "type": "object",
    "properties": {
      "name": {
        "title": "Name",
        "type": "string",
        "default": "Dyson Pure Cool",
        "required": true
      },
      "email": {
        "title": "Dyson Account Email",
        "type": "string",
        "description": "Your Dyson account email (optional if using manual device config)"
      },
      "password": {
        "title": "Dyson Account Password",
        "type": "string",
        "description": "Your Dyson account password"
      },
      "countryCode": {
        "title": "Country Code",
        "type": "string",
        "default": "US",
        "description": "Your Dyson account country"
      },
      "devices": {
        "title": "Manual Device Configuration",
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "serial": {
              "title": "Serial Number",
              "type": "string",
              "required": true
            },
            "credentials": {
              "title": "Local Credentials",
              "type": "string",
              "required": true
            },
            "ipAddress": {
              "title": "IP Address",
              "type": "string",
              "required": true
            },
            "name": {
              "title": "Display Name",
              "type": "string"
            }
          }
        }
      },
      "pollingInterval": {
        "title": "Polling Interval (seconds)",
        "type": "integer",
        "default": 60,
        "minimum": 10,
        "maximum": 300
      },
      "enableAirQuality": {
        "title": "Enable Air Quality Sensor",
        "type": "boolean",
        "default": true
      },
      "enableTemperature": {
        "title": "Enable Temperature Sensor",
        "type": "boolean",
        "default": true
      },
      "enableHumidity": {
        "title": "Enable Humidity Sensor",
        "type": "boolean",
        "default": true
      }
    }
  }
}
```

---

## 9. Architectural Decisions

### ADR-001: Local MQTT vs Cloud API

**Decision:** Use local MQTT for device control, cloud API only for initial credential retrieval.

**Rationale:**
- Faster response times (local network)
- Works when internet is down
- Privacy (commands don't go through Dyson servers)
- More reliable (no cloud dependency)

**Consequences:**
- Must handle mDNS discovery
- Need reconnection logic
- Manual credential entry for 2FA users

---

### ADR-002: Single Accessory with Multiple Services

**Decision:** Create one HomeKit accessory per Dyson device with multiple services (Fan, Temp, Humidity, AirQuality).

**Rationale:**
- Better UX in Apple Home app
- Logically grouped controls
- Matches how users think about the device

**Consequences:**
- More complex accessory class
- Must coordinate service updates

---

### ADR-003: TypeScript Strict Mode

**Decision:** Enable TypeScript strict mode with all strict checks.

**Rationale:**
- Catch errors at compile time
- Better code quality
- Self-documenting types
- Industry best practice

**Consequences:**
- More verbose type annotations
- Stricter null checks required

---

### ADR-004: Event-Driven State Updates

**Decision:** Use EventEmitter pattern for device state changes.

**Rationale:**
- Decouples device from accessory
- Easier testing (mock events)
- Supports multiple listeners
- Clean separation of concerns

**Consequences:**
- Must manage event subscriptions
- Memory leak potential if listeners not cleaned up

---

## 10. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| homebridge | ^1.8.0 \|\| ^2.0.0 | Platform API |
| mqtt | ^5.0.0 | MQTT client |
| bonjour-service | ^1.2.0 | mDNS discovery |
| axios | ^1.6.0 | HTTP client for cloud API |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.0.0 | TypeScript compiler |
| jest | ^29.0.0 | Testing framework |
| eslint | ^9.0.0 | Linting |
| @types/node | ^24.0.0 | Node.js types |

---

## Appendix: Related Documents

- [PRD](./PRD.md)
- [Dyson Protocol Research](../knowledge/dyson-protocol-research.md)
- [Project Brief](./project-brief.md)
