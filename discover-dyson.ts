#!/usr/bin/env npx ts-node
/**
 * Dyson Device Discovery Script
 * Run with: npx ts-node discover-dyson.ts
 */

import { Bonjour } from 'bonjour-service';

const TIMEOUT = 15000; // 15 seconds

console.log('Discovering Dyson devices via mDNS...');
console.log('Service type: _dyson_mqtt._tcp');
console.log(`Timeout: ${TIMEOUT / 1000} seconds\n`);

const bonjour = new Bonjour();
const browser = bonjour.find({ type: 'dyson_mqtt' });

const devices: Array<{
  serial: string;
  ip: string;
  hostname: string;
  port: number;
}> = [];

browser.on('up', (service) => {
  // Extract serial from service name
  // Formats: "455_PT4-EU-JFA0564A" or "PT4-EU-JFA0564A" or "PT4-EU-JFA0564A_dyson_mqtt"
  const match = service.name.match(/(?:^\d+_)?([A-Z0-9]{2,3}-[A-Z0-9]{2}-[A-Z0-9]{8})/i);
  const serial = match ? match[1].toUpperCase() : service.name;

  // Get IPv4 address
  const addresses = service.addresses || [];
  const ipv4 = addresses.find((addr) => addr.includes('.') && !addr.includes(':'));
  const ip = ipv4 || addresses[0] || 'unknown';

  // Avoid duplicates
  if (!devices.some((d) => d.serial === serial)) {
    devices.push({
      serial,
      ip,
      hostname: service.host,
      port: service.port,
    });

    console.log(`Found device:`);
    console.log(`  Serial:   ${serial}`);
    console.log(`  IP:       ${ip}`);
    console.log(`  Hostname: ${service.host}`);
    console.log(`  Port:     ${service.port}`);
    console.log('');
  }
});

setTimeout(() => {
  browser.stop();
  bonjour.destroy();

  console.log('-----------------------------------');
  if (devices.length === 0) {
    console.log('No Dyson devices found.');
    console.log('\nTroubleshooting:');
    console.log('- Ensure your Dyson device is powered on');
    console.log('- Ensure your device is connected to the same network');
    console.log('- Some routers block mDNS traffic between devices');
  } else {
    console.log(`Found ${devices.length} device(s):\n`);
    devices.forEach((d) => {
      console.log(`${d.serial}: ${d.ip}`);
    });
  }

  process.exit(0);
}, TIMEOUT);
