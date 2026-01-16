# homebridge-dyson-pure-cool

[![npm version](https://img.shields.io/npm/v/@mp-consulting/homebridge-dyson-pure-cool.svg)](https://www.npmjs.com/package/@mp-consulting/homebridge-dyson-pure-cool)
[![License](https://img.shields.io/npm/l/@mp-consulting/homebridge-dyson-pure-cool.svg)](https://github.com/mp-consulting/homebridge-dyson-pure-cool/blob/main/LICENSE)

**The most feature-rich Dyson plugin for HomeKit.** Control your Dyson Pure Cool, Hot+Cool, Humidify+Cool, and Big+Quiet devices through Apple HomeKit.

## Features

- **Fan Control** - Power on/off, speed (1-10), oscillation, auto mode
- **Temperature Sensor** - Room temperature with calibration offset
- **Humidity Sensor** - Relative humidity with calibration offset
- **Air Quality Sensor** - PM2.5, PM10, VOC, NO2 with overall AQI rating
- **Filter Status** - Filter life remaining with replacement indicator
- **Night Mode** - Toggle quiet operation with dimmed display
- **Continuous Monitoring** - Keep sensors active when fan is off
- **Jet Focus** - Toggle focused/diffused airflow direction
- **Thermostat** - Heating control for Hot+Cool models (HP series)
- **Humidifier** - Humidity control for Humidify+Cool models (PH series)

## Supported Devices

| Series | Models | Features |
|--------|--------|----------|
| **Pure Cool Link** | TP02, DP01 | Fan, Air Quality, Temp, Humidity |
| **Pure Cool** | TP04, TP06, TP07, DP04 | Fan, Air Quality, Temp, Humidity, Jet Focus |
| **Pure Cool Formaldehyde** | TP09 | Fan, Air Quality (incl. NO2), Temp, Humidity, Jet Focus |
| **Pure Hot+Cool Link** | HP02 | Fan, Heating, Air Quality, Temp, Humidity |
| **Pure Hot+Cool** | HP04, HP06, HP07 | Fan, Heating, Air Quality, Temp, Humidity, Jet Focus |
| **Pure Hot+Cool Formaldehyde** | HP09 | Fan, Heating, Air Quality (incl. NO2), Temp, Humidity, Jet Focus |
| **Purifier Humidify+Cool** | PH01, PH02, PH03 | Fan, Humidifier, Air Quality, Temp, Humidity, Jet Focus |
| **Purifier Humidify+Cool Formaldehyde** | PH04 | Fan, Humidifier, Air Quality (incl. NO2), Temp, Humidity, Jet Focus |
| **Purifier Big+Quiet** | BP02, BP03, BP04, BP06 | Fan, Air Quality (incl. NO2), Temp, Humidity |

## Installation

### Using Homebridge Config UI X (Recommended)

1. Search for `@mp-consulting/homebridge-dyson-pure-cool` in the Plugins tab
2. Click **Install**
3. Configure the plugin in the Settings

### Manual Installation

```bash
npm install -g @mp-consulting/homebridge-dyson-pure-cool
```

## Configuration

### Using Dyson Account (Recommended)

The easiest way to set up the plugin is through the Homebridge Config UI X settings page. The plugin uses Dyson's secure two-factor authentication (2FA) flow:

1. Enter your Dyson account email, password, and country
2. Click **Connect Account** - a verification code will be sent to your email
3. Enter the 6-digit code to complete authentication
4. Select which devices to add to HomeKit

Your local device credentials are securely retrieved and stored - your Dyson account password is never saved.

### Manual Device Configuration

If you prefer not to use your Dyson account, you can configure devices manually:

```json
{
  "platforms": [
    {
      "platform": "DysonPureCool",
      "name": "Dyson Pure Cool",
      "devices": [
        {
          "name": "Living Room Purifier",
          "serial": "ABC-AB-12345678",
          "productType": "438",
          "credentials": "your-local-credentials",
          "ipAddress": "192.168.1.100",
          "temperatureOffset": -2,
          "humidityOffset": 5
        }
      ]
    }
  ]
}
```

### Configuration Options

#### Platform Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `countryCode` | string | `US` | Account country code (US, GB, DE, etc.) |
| `discoveryTimeout` | number | `30` | mDNS discovery timeout in seconds |
| `pollInterval` | number | `60` | State polling interval in seconds |

#### Feature Toggles

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableTemperature` | boolean | `true` | Show temperature sensor |
| `enableHumidity` | boolean | `true` | Show humidity sensor |
| `enableAirQuality` | boolean | `true` | Show air quality sensor |
| `enableNightMode` | boolean | `true` | Show night mode switch |
| `enableContinuousMonitoring` | boolean | `false` | Show continuous monitoring switch |
| `enableJetFocus` | boolean | `true` | Show jet focus switch |
| `enableHeater` | boolean | `true` | Show thermostat for HP models |
| `enableHumidifier` | boolean | `true` | Show humidifier for PH models |
| `enableFilter` | boolean | `true` | Show filter status |

#### Per-Device Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `temperatureOffset` | number | `0` | Temperature calibration offset (°C) |
| `humidityOffset` | number | `0` | Humidity calibration offset (%) |
| `fullRangeHumidity` | boolean | `false` | Enable 0-100% humidity range (default: 30-70%) |
| `enableAutoModeWhenActivating` | boolean | `false` | Auto-enable auto mode on power on |
| `enableOscillationWhenActivating` | boolean | `false` | Auto-enable oscillation on power on |
| `enableNightModeWhenActivating` | boolean | `false` | Auto-enable night mode on power on |

## HomeKit Controls

### Air Purifier (All Models)

The fan appears as an Air Purifier accessory in HomeKit with the following controls:

- **Power**: Turn the fan on/off
- **Speed**: Adjust fan speed from 10% to 100% (maps to Dyson speeds 1-10)
- **Oscillation**: Toggle left-right oscillation
- **Mode** (Auto/Manual): In the Home app, tap the Air Purifier tile to open details, then select:
  - **Auto**: The fan automatically adjusts speed based on air quality sensor readings
  - **Manual**: You control the fan speed directly

### Sensors

- **Temperature**: Displays room temperature (supports calibration offset)
- **Humidity**: Displays relative humidity percentage (supports calibration offset)
- **Air Quality**: Overall rating (Excellent, Good, Fair, Inferior, Poor) calculated from PM2.5
  - PM2.5 Density (µg/m³)
  - PM10 Density (µg/m³)
  - VOC Index
  - NO2 Index (Formaldehyde models only)

### Switches

- **Night Mode**: Enables quiet operation with dimmed display
- **Continuous Monitoring**: Keeps sensors active even when fan is off
- **Jet Focus**: Toggle between focused stream and diffused airflow

### Filter

- **Filter Life Level**: Percentage of filter life remaining (0-100%)
- **Filter Change Indication**: Alert when filter needs replacement (≤10%)

### Heater (HP Models)

Dyson Hot+Cool devices are heaters with a fan - they don't have active cooling (no AC/refrigeration). The "Cool" in Hot+Cool means the fan blows room-temperature air.

- **Active**: Turn heating on/off (tap the power icon)
- **Mode**: Always shows "Heat" since that's the only mode - there's no cooling option
- **Target Temperature**: Set heating target temperature (10-38°C)
- **Current Temperature**: Displays current room temperature

To use the device as a fan without heating, simply turn off the heater and control the fan via the Air Purifier tile.

### Humidifier (PH Models)

- **Active**: Turn humidifier on/off
- **Target Humidity**: Set target humidity percentage
- **Current Humidity**: Displays current room humidity
- **Water Level**: Shows water tank status (empty/full)

## Troubleshooting

### Device Not Discovered

1. Ensure your Dyson device is on the same network as Homebridge
2. Check that mDNS/Bonjour is working on your network
3. Try increasing `discoveryTimeout` to 60 seconds
4. Use manual device configuration as a fallback

### Authentication Failed

1. Verify your Dyson account email and password are correct
2. Check that the country matches your account region
3. Ensure you enter the 2FA verification code within the time limit
4. Try logging into the Dyson app to verify your credentials work

### Device Shows "Not Responding"

1. Check that the device is powered on and connected to WiFi
2. Verify the device IP address hasn't changed (use static IP)
3. Restart Homebridge to re-establish MQTT connection
4. Check Homebridge logs for connection errors

### Sensors Not Updating

1. Ensure continuous monitoring is enabled on the device
2. Check `pollInterval` isn't set too high
3. Some sensors take time to initialize after power-on

### Temperature/Humidity Readings Inaccurate

Use the `temperatureOffset` and `humidityOffset` options to calibrate sensor readings. For example, if the temperature reads 2°C too high, set `temperatureOffset: -2`.

### Finding Device Credentials

To manually configure devices, you need the local MQTT credentials:

1. Using a network proxy to intercept Dyson app traffic
2. Using the Dyson Cloud API directly with your account
3. Using community tools that extract credentials

The credentials are a local password specific to each device, not your Dyson account password.

### Debug Logging

Enable debug logging in Homebridge to see detailed plugin output:

```bash
homebridge -D
```

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting pull requests.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

## License

This project is licensed under the Apache-2.0 License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Homebridge](https://homebridge.io/) for the amazing platform
- The Dyson community for reverse-engineering the protocol
- All contributors and testers
