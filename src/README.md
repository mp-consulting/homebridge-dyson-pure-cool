# Source Directory

This directory contains the main source code for the homebridge-dyson-pure-cool plugin.

## Directory Structure

```
src/
├── index.ts              # Plugin entry point - registers platform with Homebridge
├── platform.ts           # Main platform implementation (DysonPureCoolPlatform)
├── platformAccessory.ts  # Wraps Dyson devices as HomeKit accessories
├── accessories/          # HomeKit service implementations
├── config/               # Configuration, constants, and device catalog
├── devices/              # Device abstraction layer
├── discovery/            # Device discovery (Cloud API + mDNS)
├── protocol/             # MQTT communication protocol
├── types/                # TypeScript type definitions
└── utils/                # Utility functions
```

## Architecture Overview

### Data Flow

```
Homebridge API
     ↓
Platform (platform.ts)
     ↓
Device Discovery (discovery/)
     ↓
Device Manager (devices/)
     ↓
Platform Accessory (platformAccessory.ts)
     ↓
Dyson Accessory (accessories/)
     ↓
HomeKit Services (accessories/services/)
     ↓
MQTT Protocol (protocol/)
     ↓
Dyson Device (local network)
```

### Key Components

- **Platform**: Orchestrates device discovery and accessory registration
- **Device Manager**: Combines cloud API + mDNS to find and connect to devices
- **Accessories**: Expose Dyson features to HomeKit through services
- **Protocol**: Handles MQTT communication and message encoding/decoding

## Root Files

### index.ts
Plugin entry point that registers `DysonPureCoolPlatform` with Homebridge.

### platform.ts
Main platform class implementing `DynamicPlatformPlugin`:
- Manages device discovery and registration
- Handles cached accessory restoration
- Orchestrates mDNS discovery for devices without IP addresses

### platformAccessory.ts
Wraps individual Dyson devices as HomeKit accessories:
- Creates and configures HomeKit services for each device
- Bridges Dyson device state to HomeKit characteristics
- Manages device connection/disconnection states
