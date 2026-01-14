# homebridge-dyson-pure-cool

[![npm version](https://img.shields.io/npm/v/homebridge-dyson-pure-cool.svg)](https://www.npmjs.com/package/homebridge-dyson-pure-cool)
[![License](https://img.shields.io/npm/l/homebridge-dyson-pure-cool.svg)](https://github.com/homebridge/homebridge-dyson-pure-cool/blob/main/LICENSE)

Homebridge plugin for Dyson Pure Cool air purifiers and fans. Control your Dyson devices through Apple HomeKit.

## Features

- **Fan Control** - Power on/off, speed (0-100%), oscillation, auto mode
- **Temperature Sensor** - Room temperature in Celsius
- **Humidity Sensor** - Relative humidity percentage
- **Air Quality Sensor** - PM2.5, PM10, VOC levels with overall air quality rating
- **Filter Status** - Filter life remaining with replacement indicator
- **Night Mode** - Toggle quiet operation with dimmed display
- **Continuous Monitoring** - Keep sensors active when fan is off

## Supported Devices

| Model | Product Type | Features |
|-------|--------------|----------|
| Pure Cool Tower (TP04) | 438 | Fan, Air Quality, Temp, Humidity |
| Purifier Cool (TP07) | 438E | Fan, Air Quality, Temp, Humidity |
| Pure Hot+Cool Link (HP02) | 455 | Fan, Heating, Air Quality, Temp, Humidity |

More Dyson Link-series devices may work but are untested.

## Installation

### Using Homebridge Config UI X (Recommended)

1. Search for `homebridge-dyson-pure-cool` in the Plugins tab
2. Click **Install**
3. Configure the plugin in the Settings

### Manual Installation

```bash
npm install -g homebridge-dyson-pure-cool
```

## Configuration

### Using Dyson Account (Recommended)

The easiest way to set up the plugin is using your Dyson account credentials. The plugin will automatically discover your devices.

```json
{
  "platforms": [
    {
      "platform": "DysonPureCool",
      "name": "Dyson Pure Cool",
      "email": "your-email@example.com",
      "password": "your-dyson-password",
      "countryCode": "US"
    }
  ]
}
```

#### Two-Factor Authentication (2FA)

If your Dyson account uses 2FA, you'll need to complete the verification process. Check the Homebridge logs for the OTP prompt during first setup.

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
          "ipAddress": "192.168.1.100"
        }
      ]
    }
  ]
}
```

To find your device credentials, you'll need to extract them from the Dyson API. See the [Troubleshooting](#finding-device-credentials) section.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `email` | string | - | Dyson account email |
| `password` | string | - | Dyson account password |
| `countryCode` | string | `US` | Account country code (US, GB, DE, etc.) |
| `discoveryTimeout` | number | `30` | mDNS discovery timeout in seconds |
| `pollInterval` | number | `60` | State polling interval in seconds |
| `enableTemperature` | boolean | `true` | Show temperature sensor |
| `enableHumidity` | boolean | `true` | Show humidity sensor |
| `enableAirQuality` | boolean | `true` | Show air quality sensor |
| `enableNightMode` | boolean | `true` | Show night mode switch |
| `enableContinuousMonitoring` | boolean | `false` | Show continuous monitoring switch |
| `enableFilter` | boolean | `true` | Show filter status |

## HomeKit Controls

### Fan

- **Power**: Turn the fan on/off
- **Speed**: Adjust fan speed from 10% to 100% (maps to Dyson speeds 1-10)
- **Oscillation**: Toggle left-right oscillation
- **Auto Mode**: Let the fan automatically adjust based on air quality

### Sensors

- **Temperature**: Displays room temperature (read-only)
- **Humidity**: Displays relative humidity percentage (read-only)
- **Air Quality**: Overall rating (Excellent, Good, Fair, Inferior, Poor) calculated from PM2.5

### Switches

- **Night Mode**: Enables quiet operation with dimmed display
- **Continuous Monitoring**: Keeps sensors active even when fan is off

### Filter

- **Filter Life Level**: Percentage of filter life remaining (0-100%)
- **Filter Change Indication**: Alert when filter needs replacement (<=10%)

## Troubleshooting

### Device Not Discovered

1. Ensure your Dyson device is on the same network as Homebridge
2. Check that mDNS/Bonjour is working on your network
3. Try increasing `discoveryTimeout` to 60 seconds
4. Use manual device configuration as a fallback

### Authentication Failed

1. Verify your Dyson account email and password
2. Check the `countryCode` matches your account region
3. If using 2FA, complete the verification in Homebridge logs
4. Try logging into the Dyson app to verify credentials work

### Device Shows "Not Responding"

1. Check that the device is powered on and connected to WiFi
2. Verify the device IP address hasn't changed (use static IP or manual config)
3. Restart Homebridge to re-establish MQTT connection
4. Check Homebridge logs for connection errors

### Sensors Not Updating

1. Ensure continuous monitoring is enabled on the device
2. Check `pollInterval` isn't set too high
3. Some sensors take time to initialize after power-on

### Finding Device Credentials

To manually configure devices, you need the local MQTT credentials. You can extract these by:

1. Using a network proxy to intercept Dyson app traffic
2. Using the Dyson Cloud API directly with your account
3. Using community tools that extract credentials

The credentials are a local password specific to each device, not your Dyson account password.

### Debug Logging

Enable debug logging in Homebridge to see detailed plugin output:

```bash
homebridge -D
```

Or set the `DEBUG` environment variable:

```bash
DEBUG=* homebridge
```

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting pull requests.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

This project is licensed under the Apache-2.0 License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Homebridge](https://homebridge.io/) for the amazing platform
- The Dyson community for reverse-engineering the protocol
- All contributors and testers
