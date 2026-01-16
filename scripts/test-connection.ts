/**
 * Test script to connect directly to Dyson device and retrieve raw sensor values
 *
 * Usage: npx tsx scripts/test-connection.ts [device-index]
 *
 * Reads device configuration from test/hbConfig/config.json
 * If multiple devices are configured, specify the index (0-based) as argument
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import mqtt from 'mqtt';

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
const deviceIndex = parseInt(process.argv[2] || '0', 10);
const config = loadConfig(deviceIndex);

const MQTT_PORT = 1883;

console.log('='.repeat(60));
console.log('Dyson Device Direct Connection Test');
console.log('='.repeat(60));
console.log(`Device: ${config.name || config.serial}`);
console.log(`Serial: ${config.serial}`);
console.log(`Product Type: ${config.productType}`);
console.log(`IP Address: ${config.ipAddress}`);
console.log('='.repeat(60));

const brokerUrl = `mqtt://${config.ipAddress}:${MQTT_PORT}`;
const statusTopic = `${config.productType}/${config.serial}/status/current`;
const commandTopic = `${config.productType}/${config.serial}/command`;

console.log(`\nConnecting to: ${brokerUrl}`);
console.log(`Status topic: ${statusTopic}`);
console.log(`Command topic: ${commandTopic}\n`);

const client = mqtt.connect(brokerUrl, {
  username: config.serial,
  password: config.localCredentials,
  clientId: `test_script_${Date.now()}`,
  keepalive: 30,
  connectTimeout: 10000,
  reconnectPeriod: 0,
  clean: true,
  protocolVersion: 4,
});

client.on('connect', () => {
  console.log('✓ Connected to device!\n');

  // Subscribe to status topic
  client.subscribe(statusTopic, { qos: 0 }, (err) => {
    if (err) {
      console.error('Failed to subscribe:', err);
      return;
    }
    console.log(`✓ Subscribed to: ${statusTopic}\n`);

    // Request current state
    const requestMessage = {
      msg: 'REQUEST-CURRENT-STATE',
      time: new Date().toISOString(),
    };

    console.log('Sending REQUEST-CURRENT-STATE...\n');
    client.publish(commandTopic, JSON.stringify(requestMessage));
  });
});

client.on('message', (topic, payload) => {
  console.log('-'.repeat(60));
  console.log(`Message received on: ${topic}`);
  console.log('-'.repeat(60));

  const rawPayload = payload.toString('utf8');
  console.log('Raw payload:');
  try {
    console.log(JSON.stringify(JSON.parse(rawPayload), null, 2));
  } catch {
    console.log(rawPayload);
  }
  console.log('');

  try {
    const data = JSON.parse(rawPayload);
    const msgType = data.msg;

    console.log(`Message type: ${msgType}`);
    console.log(`Time: ${data.time || 'N/A'}\n`);

    if (msgType === 'CURRENT-STATE' || msgType === 'STATE-CHANGE') {
      const state = data['product-state'] || data.data;
      console.log('Product State:');
      console.log(JSON.stringify(state, null, 2));

      // Highlight air quality fields
      console.log('\n--- Air Quality Fields ---');
      console.log(`p25r (PM2.5): ${state?.p25r ?? 'not present'}`);
      console.log(`p10r (PM10): ${state?.p10r ?? 'not present'}`);
      console.log(`pact (PM - older): ${state?.pact ?? 'not present'}`);
      console.log(`va10 (VOC): ${state?.va10 ?? 'not present'}`);
      console.log(`vact (VOC - older): ${state?.vact ?? 'not present'}`);
      console.log(`noxl (NO2): ${state?.noxl ?? 'not present'}`);
    } else if (msgType === 'ENVIRONMENTAL-CURRENT-SENSOR-DATA') {
      const sensorData = data.data || data;
      console.log('Environmental Sensor Data:');
      console.log(JSON.stringify(sensorData, null, 2));

      // Highlight air quality fields
      console.log('\n--- Air Quality Fields ---');
      console.log(`p25r (PM2.5): ${sensorData?.p25r ?? 'not present'}`);
      console.log(`p10r (PM10): ${sensorData?.p10r ?? 'not present'}`);
      console.log(`pact (PM - older): ${sensorData?.pact ?? 'not present'}`);
      console.log(`va10 (VOC): ${sensorData?.va10 ?? 'not present'}`);
      console.log(`vact (VOC - older): ${sensorData?.vact ?? 'not present'}`);
      console.log(`noxl (NO2): ${sensorData?.noxl ?? 'not present'}`);
      console.log(`tact (Temperature): ${sensorData?.tact ?? 'not present'}`);
      console.log(`hact (Humidity): ${sensorData?.hact ?? 'not present'}`);
    } else {
      console.log('Full message:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch {
    console.log('Raw payload:', payload.toString());
  }

  console.log('\n');
});

client.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

client.on('close', () => {
  console.log('Connection closed');
});

// Keep running for 30 seconds to receive environmental updates
console.log('Waiting for messages (will exit in 30 seconds)...\n');

setTimeout(() => {
  console.log('\nTest complete. Disconnecting...');
  client.end();
  process.exit(0);
}, 30000);
