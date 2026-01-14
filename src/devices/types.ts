/**
 * Device Types and Interfaces
 */

/**
 * Device information from discovery
 */
export interface DeviceInfo {
  /** Device serial number */
  serial: string;
  /** Dyson product type code (e.g., '438', '455') */
  productType: string;
  /** User-assigned device name */
  name: string;
  /** Local MQTT credentials */
  credentials: string;
  /** Device IP address on local network */
  ipAddress?: string;
}

/**
 * Device state representing current device status
 */
export interface DeviceState {
  // Connection status
  /** Whether the device is connected */
  connected: boolean;

  // Power & Mode
  /** Fan power state */
  isOn: boolean;
  /** Fan speed (1-10, or -1 for auto) */
  fanSpeed: number;
  /** Oscillation enabled */
  oscillation: boolean;
  /** Auto mode enabled */
  autoMode: boolean;

  // Oscillation angles (degrees)
  /** Oscillation start angle (45-355) */
  oscillationAngleStart?: number;
  /** Oscillation end angle (45-355) */
  oscillationAngleEnd?: number;

  // Night mode
  /** Night mode enabled */
  nightMode: boolean;

  // Continuous monitoring
  /** Continuous monitoring enabled (sensors active when fan off) */
  continuousMonitoring?: boolean;

  // Airflow direction (for models that support it)
  /** Front airflow enabled */
  frontAirflow?: boolean;

  // Environmental sensors
  /** Temperature in Kelvin (divide by 10 for actual value) */
  temperature?: number;
  /** Relative humidity percentage */
  humidity?: number;

  // Air quality (for Pure Cool models)
  /** Particulate matter 2.5 (PM2.5) */
  pm25?: number;
  /** Particulate matter 10 (PM10) */
  pm10?: number;
  /** Volatile organic compounds index */
  vocIndex?: number;
  /** Nitrogen dioxide index */
  no2Index?: number;

  // Filter status
  /** HEPA filter life remaining (hours) */
  hepaFilterLife?: number;
  /** Carbon filter life remaining (hours) */
  carbonFilterLife?: number;

  // Heating (for Hot+Cool models)
  /** Heating enabled */
  heatingEnabled?: boolean;
  /** Target temperature in Kelvin (divide by 10) */
  targetTemperature?: number;

  // Humidifier (for humidifier models)
  /** Humidifier enabled */
  humidifierEnabled?: boolean;
  /** Target humidity percentage */
  targetHumidity?: number;
  /** Water tank empty */
  waterTankEmpty?: boolean;
}

/**
 * Default device state
 */
export function createDefaultState(): DeviceState {
  return {
    connected: false,
    isOn: false,
    fanSpeed: 0,
    oscillation: false,
    autoMode: false,
    nightMode: false,
  };
}

/**
 * Device features supported by a device type
 */
export interface DeviceFeatures {
  /** Supports fan control */
  fan: boolean;
  /** Supports oscillation */
  oscillation: boolean;
  /** Supports auto mode */
  autoMode: boolean;
  /** Supports night mode */
  nightMode: boolean;
  /** Supports continuous monitoring */
  continuousMonitoring: boolean;
  /** Supports front airflow direction */
  frontAirflow: boolean;
  /** Has temperature sensor */
  temperatureSensor: boolean;
  /** Has humidity sensor */
  humiditySensor: boolean;
  /** Has air quality sensors */
  airQualitySensor: boolean;
  /** Supports heating */
  heating: boolean;
  /** Supports humidification */
  humidifier: boolean;
  /** Has HEPA filter */
  hepaFilter: boolean;
  /** Has carbon filter */
  carbonFilter: boolean;
}

/**
 * Default features (minimum fan support)
 */
export const DEFAULT_FEATURES: DeviceFeatures = {
  fan: true,
  oscillation: true,
  autoMode: true,
  nightMode: true,
  continuousMonitoring: true,
  frontAirflow: false,
  temperatureSensor: false,
  humiditySensor: false,
  airQualitySensor: false,
  heating: false,
  humidifier: false,
  hepaFilter: false,
  carbonFilter: false,
};

/**
 * Events emitted by DysonDevice
 */
export interface DeviceEvents {
  /** Emitted when device connects */
  connect: [];
  /** Emitted when device disconnects */
  disconnect: [];
  /** Emitted when device state changes */
  stateChange: [DeviceState];
  /** Emitted on device error */
  error: [Error];
}
