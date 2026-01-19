/**
 * Test script to test each command on a Dyson device
 *
 * Usage: npx tsx scripts/test-commands.ts [device-index]
 *
 * Reads device configuration from test/hbConfig/config.json
 * If multiple devices are configured, specify the index (0-based) as argument
 *
 * This script connects to the device and lets you test individual commands
 * to verify they are being received and acted upon.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import mqtt from 'mqtt';
import readline from 'readline';
import { getDeviceByProductType } from '../src/config/deviceCatalog.js';

interface DeviceConfig {
  serial: string;
  productType: string;
  localCredentials: string;
  ipAddress: string;
  name?: string;
}

interface PlatformConfig {
  platform: string;
  devices?: DeviceConfig[];
}

interface HomebridgeConfig {
  platforms: PlatformConfig[];
}

// Load configuration from Homebridge config file
function loadConfig(deviceIndex = 0): DeviceConfig {
  const configPath = join(process.cwd(), 'test', 'hbConfig', 'config.json');

  let configData: HomebridgeConfig;
  try {
    const rawConfig = readFileSync(configPath, 'utf8');
    configData = JSON.parse(rawConfig) as HomebridgeConfig;
  } catch (err) {
    console.error(`Failed to read config file at ${configPath}`);
    console.error('Make sure test/hbConfig/config.json exists with your device configuration');
    process.exit(1);
  }

  const dysonPlatform = configData.platforms.find(
    (p) => p.platform === 'DysonPureCool',
  );

  if (!dysonPlatform?.devices?.length) {
    console.error('No Dyson devices found in config file');
    process.exit(1);
  }

  if (deviceIndex >= dysonPlatform.devices.length) {
    console.error(`Device index ${deviceIndex} out of range. Found ${dysonPlatform.devices.length} device(s).`);
    console.error('Available devices:');
    dysonPlatform.devices.forEach((d, i) => {
      console.error(`  [${i}] ${d.name || d.serial}`);
    });
    process.exit(1);
  }

  return dysonPlatform.devices[deviceIndex];
}

// Parse command line arguments
const arg = process.argv[2] || '0';

// Show help if requested
if (arg === 'help' || arg === '--help' || arg === '-h') {
  console.log('Usage: npx tsx scripts/test-commands.ts [device-index]');
  console.log('');
  console.log('  device-index  Index of device in config (0-based, default: 0)');
  console.log('');
  console.log('Interactive commands will be shown after connecting to the device.');
  process.exit(0);
}

const deviceIndex = parseInt(arg, 10);
if (isNaN(deviceIndex)) {
  console.error(`Invalid device index: ${arg}`);
  console.error('Usage: npx tsx scripts/test-commands.ts [device-index]');
  process.exit(1);
}

const config = loadConfig(deviceIndex);

const MQTT_PORT = 1883;

// Determine if this is a Pure Cool Link device (TP02, DP01) - uses fpwr/auto protocol
// Note: HP02 (455) is called "Hot+Cool Link" but uses fmod like newer devices
const deviceInfo = getDeviceByProductType(config.productType);
const isLinkSeries = config.productType === '475' || config.productType === '469';

console.log('='.repeat(60));
console.log('Dyson Device Command Tester');
console.log('='.repeat(60));
console.log(`Device: ${config.name || config.serial}`);
console.log(`Serial: ${config.serial}`);
console.log(`Product Type: ${config.productType}`);
console.log(`Model: ${deviceInfo?.modelName || 'Unknown'} (${deviceInfo?.modelCode || 'Unknown'})`);
console.log(`Series: ${deviceInfo?.series || 'Unknown'}`);
console.log(`Is Link Series: ${isLinkSeries}`);
console.log(`IP Address: ${config.ipAddress}`);
console.log('='.repeat(60));

const brokerUrl = `mqtt://${config.ipAddress}:${MQTT_PORT}`;
const statusTopic = `${config.productType}/${config.serial}/status/current`;
const commandTopic = `${config.productType}/${config.serial}/command`;

console.log(`\nConnecting to: ${brokerUrl}`);
console.log(`Command topic: ${commandTopic}\n`);

const client = mqtt.connect(brokerUrl, {
  username: config.serial,
  password: config.localCredentials,
  clientId: `test_commands_${Date.now()}`,
  keepalive: 30,
  connectTimeout: 10000,
  reconnectPeriod: 0,
  clean: true,
  protocolVersion: 4,
});

// Track current device state
let currentState: Record<string, unknown> = {};

function sendCommand(data: Record<string, string>): void {
  const command = {
    msg: 'STATE-SET',
    time: new Date().toISOString(),
    'mode-reason': 'LAPP',
    data,
  };

  console.log('\n>>> Sending command:');
  console.log(JSON.stringify(command, null, 2));
  client.publish(commandTopic, JSON.stringify(command), { qos: 0 }, (err) => {
    if (err) {
      console.log('>>> PUBLISH ERROR:', err.message);
    } else {
      console.log('>>> Command published successfully');
    }
  });
}

function requestCurrentState(): void {
  const command = {
    msg: 'REQUEST-CURRENT-STATE',
    time: new Date().toISOString(),
  };
  console.log('\n>>> Requesting current state...');
  client.publish(commandTopic, JSON.stringify(command));
}

function showHelp(): void {
  console.log('\n=== Available Commands ===');
  console.log('');
  console.log('  Power Control:');
  if (isLinkSeries) {
    console.log('    on       - Turn fan ON (fpwr: ON, auto: OFF, fnsp: 0004)');
    console.log('    off      - Turn fan OFF (fpwr: OFF)');
    console.log('    auto     - Turn fan ON in AUTO mode (fpwr: ON, auto: ON, fnsp: AUTO)');
  } else {
    console.log('    on       - Turn fan ON (fmod: FAN)');
    console.log('    off      - Turn fan OFF (fmod: OFF)');
    console.log('    auto     - Turn fan ON in AUTO mode (fmod: AUTO)');
  }
  console.log('');
  console.log('  Speed Control:');
  console.log('    speed N  - Set fan speed to N (1-10)');
  console.log('');
  console.log('  Features:');
  console.log('    osc on   - Turn oscillation ON');
  console.log('    osc off  - Turn oscillation OFF');
  console.log('    night on - Turn night mode ON');
  console.log('    night off- Turn night mode OFF');
  console.log('    jet on   - Turn jet focus ON (focused)');
  console.log('    jet off  - Turn jet focus OFF (diffuse)');
  console.log('    mon on   - Turn continuous monitoring ON');
  console.log('    mon off  - Turn continuous monitoring OFF');
  console.log('');
  console.log('  Heating (HP models):');
  console.log('    heat on  - Turn heating mode ON');
  console.log('    heat off - Turn heating mode OFF');
  console.log('    temp N   - Set target temperature to N °C (1-37)');
  console.log('');
  console.log('  Debug:');
  console.log('    state    - Request current state');
  console.log('    raw JSON - Send raw JSON data (e.g., raw {"fpwr":"ON"})');
  console.log('');
  console.log('  Other:');
  console.log('    help     - Show this help');
  console.log('    quit     - Exit the script');
  console.log('');
}

function processCommand(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const arg = parts[1];

  switch (cmd) {
    case 'help':
    case '?':
      showHelp();
      break;

    case 'quit':
    case 'exit':
    case 'q':
      return false;

    case 'state':
      requestCurrentState();
      break;

    case 'raw':
      try {
        const rawData = JSON.parse(input.substring(4).trim());
        sendCommand(rawData);
      } catch (e) {
        console.log('Invalid JSON. Usage: raw {"field":"value"}');
      }
      break;

    // Power commands
    case 'on':
      if (isLinkSeries) {
        sendCommand({ fpwr: 'ON', auto: 'OFF', fnsp: '0004' });
      } else {
        sendCommand({ fmod: 'FAN' });
      }
      break;

    case 'off':
      if (isLinkSeries) {
        sendCommand({ fpwr: 'OFF' });
      } else {
        sendCommand({ fmod: 'OFF' });
      }
      break;

    case 'auto':
      if (isLinkSeries) {
        sendCommand({ fpwr: 'ON', auto: 'ON', fnsp: 'AUTO' });
      } else {
        sendCommand({ fmod: 'AUTO' });
      }
      break;

    // Speed command
    case 'speed': {
      const speed = parseInt(arg, 10);
      if (isNaN(speed) || speed < 1 || speed > 10) {
        console.log('Invalid speed. Usage: speed N (1-10)');
      } else {
        const encodedSpeed = String(speed).padStart(4, '0');
        if (isLinkSeries) {
          sendCommand({ fpwr: 'ON', auto: 'OFF', fnsp: encodedSpeed });
        } else {
          sendCommand({ fmod: 'FAN', fnsp: encodedSpeed });
        }
      }
      break;
    }

    // Oscillation
    case 'osc':
      if (arg === 'on') {
        sendCommand({ oson: 'ON' });
      } else if (arg === 'off') {
        sendCommand({ oson: 'OFF' });
      } else {
        console.log('Usage: osc on|off');
      }
      break;

    // Night mode
    case 'night':
      if (arg === 'on') {
        sendCommand({ nmod: 'ON' });
      } else if (arg === 'off') {
        sendCommand({ nmod: 'OFF' });
      } else {
        console.log('Usage: night on|off');
      }
      break;

    // Jet focus
    case 'jet':
      if (arg === 'on') {
        sendCommand({ ffoc: 'ON' });
      } else if (arg === 'off') {
        sendCommand({ ffoc: 'OFF' });
      } else {
        console.log('Usage: jet on|off');
      }
      break;

    // Continuous monitoring
    case 'mon':
      if (arg === 'on') {
        sendCommand({ rhtm: 'ON' });
      } else if (arg === 'off') {
        sendCommand({ rhtm: 'OFF' });
      } else {
        console.log('Usage: mon on|off');
      }
      break;

    // Heating mode
    case 'heat':
      if (arg === 'on') {
        sendCommand({ hmod: 'HEAT' });
      } else if (arg === 'off') {
        sendCommand({ hmod: 'OFF' });
      } else {
        console.log('Usage: heat on|off');
      }
      break;

    // Target temperature
    case 'temp': {
      const temp = parseInt(arg, 10);
      if (isNaN(temp) || temp < 1 || temp > 37) {
        console.log('Invalid temperature. Usage: temp N (1-37 °C)');
      } else {
        // Convert to Kelvin * 10
        const kelvinTimes10 = Math.round((temp + 273.15) * 10);
        sendCommand({ hmax: String(kelvinTimes10) });
      }
      break;
    }

    default:
      console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
  }

  return true;
}

client.on('connect', () => {
  console.log('✓ Connected to device!\n');

  // Subscribe to status topic
  client.subscribe(statusTopic, { qos: 0 }, (err) => {
    if (err) {
      console.error('Failed to subscribe:', err);
      return;
    }
    console.log(`✓ Subscribed to: ${statusTopic}`);

    // Request current state
    requestCurrentState();

    // Start interactive prompt
    console.log('\nType "help" for available commands, "quit" to exit.\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = (): void => {
      rl.question('> ', (answer) => {
        if (processCommand(answer)) {
          prompt();
        } else {
          console.log('\nDisconnecting...');
          client.end();
          rl.close();
          process.exit(0);
        }
      });
    };

    prompt();
  });
});

client.on('message', (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString('utf8'));
    const msgType = data.msg;

    if (msgType === 'CURRENT-STATE' || msgType === 'STATE-CHANGE') {
      const state = data['product-state'] || data.data;
      console.log(`\n<<< Received ${msgType}:`);

      // Show relevant fields
      const relevantFields = ['fpwr', 'fmod', 'fnsp', 'auto', 'oson', 'nmod', 'ffoc', 'rhtm', 'hmod', 'hmax', 'hsta'];
      const filteredState: Record<string, unknown> = {};
      for (const field of relevantFields) {
        if (state?.[field] !== undefined) {
          filteredState[field] = state[field];
        }
      }
      console.log(JSON.stringify(filteredState, null, 2));

      // Update current state
      if (state) {
        currentState = { ...currentState, ...state };
      }
    }
  } catch {
    // Ignore non-JSON messages
  }
});

client.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

client.on('close', () => {
  console.log('Connection closed');
});
