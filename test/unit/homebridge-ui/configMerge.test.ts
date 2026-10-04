/**
 * Setup wizard config merge (homebridge-ui/public/config-merge.js) Unit Tests
 *
 * The file is a classic browser script that sets `DysonConfigMerge` on the
 * global object, so it is run in a VM context instead of being imported.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

interface ConfigMerge {
  mergePluginConfig: (existing: unknown, built: Record<string, any>) => Record<string, any>;
  withSavedDeviceSettings: (cloudDevices: unknown, savedDevices: unknown) => Record<string, any>[];
}

const source = readFileSync(fileURLToPath(new URL('../../../homebridge-ui/public/config-merge.js', import.meta.url)), 'utf8');
const context: { globalThis?: unknown; DysonConfigMerge?: ConfigMerge } = {};
context.globalThis = context;
runInNewContext(source, context);
const { mergePluginConfig, withSavedDeviceSettings } = context.DysonConfigMerge as ConfigMerge;

// Plain JSON round-trip: VM-context objects have another realm's prototypes
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const merge = (existing: unknown, built: Record<string, any>) => plain(mergePluginConfig(existing, built));

/** What the wizard's buildConfig() produces */
function wizardOutput(devices: Record<string, any>[], overrides: Record<string, any> = {}) {
  return {
    platform: 'DysonPureCool',
    name: 'Dyson Pure Cool',
    countryCode: 'FR',
    devices,
    enableTemperature: true,
    enableHumidity: true,
    enableAirQuality: true,
    enableNightMode: false,
    enableJetFocus: true,
    enableAutoMode: true,
    enableFilterStatus: true,
    pollingInterval: 60,
    ...overrides,
  };
}

const deviceA = { serial: 'AAA-EU-AAA0001A', name: 'Bedroom', productType: '438', localCredentials: 'credA' };
const deviceB = { serial: 'BBB-EU-BBB0002B', name: 'Office', productType: '527', localCredentials: 'credB' };

function savedConfig() {
  return {
    platform: 'DysonPureCool',
    name: 'Dyson Pure Cool',
    countryCode: 'FR',
    isSingleAccessoryModeEnabled: true,
    enableHeater: false,
    enableHumidifier: false,
    enableContinuousMonitoring: true,
    _bridge: { username: '0E:11:22:33:44:55', port: 51234 },
    devices: [
      { ...deviceA, ipAddress: '192.168.1.20', isNightModeEnabled: false, fullRangeHumidity: true, temperatureOffset: -1 },
      { ...deviceB, isHeatingDisabled: true, heatingServiceType: 'heater' },
    ],
    enableTemperature: false,
    pollingInterval: 30,
  };
}

describe('DysonConfigMerge.mergePluginConfig', () => {
  it('keeps top-level keys the wizard does not render', () => {
    const merged = merge(savedConfig(), wizardOutput([deviceA, deviceB]));

    expect(merged.isSingleAccessoryModeEnabled).toBe(true);
    expect(merged.enableHeater).toBe(false);
    expect(merged.enableHumidifier).toBe(false);
    expect(merged.enableContinuousMonitoring).toBe(true);
  });

  it('keeps the _bridge block (child bridge)', () => {
    const merged = merge(savedConfig(), wizardOutput([deviceA, deviceB]));
    expect(merged._bridge).toEqual({ username: '0E:11:22:33:44:55', port: 51234 });
  });

  it('applies the wizard-owned top-level options', () => {
    const merged = merge(savedConfig(), wizardOutput([deviceA, deviceB], { pollingInterval: 120, countryCode: 'GB' }));

    expect(merged.platform).toBe('DysonPureCool');
    expect(merged.pollingInterval).toBe(120);
    expect(merged.countryCode).toBe('GB');
    expect(merged.enableTemperature).toBe(true);
  });

  it('keeps per-device overrides the wizard does not manage, matched by serial', () => {
    // Wizard lists the devices in another order than the saved config
    const merged = merge(savedConfig(), wizardOutput([deviceB, { ...deviceA, temperatureOffset: -1 }]));

    expect(merged.devices.map((d: any) => d.serial)).toEqual([deviceB.serial, deviceA.serial]);
    expect(merged.devices[1]).toEqual({
      ...deviceA,
      ipAddress: '192.168.1.20',
      isNightModeEnabled: false,
      fullRangeHumidity: true,
      temperatureOffset: -1,
    });
    expect(merged.devices[0].isHeatingDisabled).toBe(true);
  });

  it('drops a wizard-managed device setting the user turned off or reset', () => {
    // deviceB's heating service and deviceA's offset are no longer set in the wizard
    const merged = merge(savedConfig(), wizardOutput([deviceA, deviceB]));

    expect(merged.devices[0]).not.toHaveProperty('temperatureOffset');
    expect(merged.devices[1]).not.toHaveProperty('heatingServiceType');
    expect(merged.devices[1].isHeatingDisabled).toBe(true);
  });

  it('removes a device removed in the wizard', () => {
    const merged = merge(savedConfig(), wizardOutput([deviceB]));

    expect(merged.devices).toHaveLength(1);
    expect(merged.devices[0].serial).toBe(deviceB.serial);
    expect(merged._bridge).toBeDefined();
  });

  it('removes every device when the wizard has none', () => {
    expect(merge(savedConfig(), wizardOutput([])).devices).toEqual([]);
  });

  it('applies a rename and updated fields while keeping the device overrides', () => {
    const renamed = { ...deviceA, name: 'Living Room', localCredentials: 'newCred', ipAddress: '192.168.1.99', firmwareVersion: '21.04.03' };
    const merged = merge(savedConfig(), wizardOutput([renamed, deviceB]));

    expect(merged.devices[0]).toMatchObject({
      serial: deviceA.serial,
      name: 'Living Room',
      localCredentials: 'newCred',
      ipAddress: '192.168.1.99',
      firmwareVersion: '21.04.03',
      isNightModeEnabled: false,
      fullRangeHumidity: true,
    });
  });

  it('keeps a saved IP address when the wizard has none', () => {
    const merged = merge(savedConfig(), wizardOutput([{ ...deviceA, ipAddress: undefined }]));
    expect(merged.devices[0].ipAddress).toBe('192.168.1.20');
  });

  it('adds new devices as the wizard built them', () => {
    const deviceC = { serial: 'CCC-EU-CCC0003C', name: 'Kitchen', productType: '358', localCredentials: 'credC', name2: undefined };
    const merged = merge(savedConfig(), wizardOutput([deviceA, deviceB, deviceC]));

    expect(merged.devices[2]).toEqual({ serial: 'CCC-EU-CCC0003C', name: 'Kitchen', productType: '358', localCredentials: 'credC' });
  });

  it('builds the config from the wizard alone when nothing is saved', () => {
    const built = wizardOutput([deviceA]);
    expect(merge(undefined, built)).toEqual(built);
    expect(merge(null, built)).toEqual(built);
  });

  it('ignores malformed saved device entries and missing device lists', () => {
    const existing = { ...savedConfig(), devices: [null, 'x', { name: 'no serial' }, { ...deviceA, isAirQualityIgnored: true }] };
    const merged = merge(existing, wizardOutput([deviceA]));
    expect(merged.devices).toEqual([{ ...deviceA, isAirQualityIgnored: true }]);

    const noDevices = merge({ _bridge: { port: 1 } }, { ...wizardOutput([]), devices: undefined });
    expect(noDevices).toMatchObject({ _bridge: { port: 1 }, devices: [] });
  });

  it('does not modify the saved config object', () => {
    const existing = savedConfig();
    const before = plain(existing);
    mergePluginConfig(existing, wizardOutput([deviceB]));
    expect(existing).toEqual(before);
  });
});

describe('DysonConfigMerge.withSavedDeviceSettings', () => {
  it('copies the saved wizard settings onto devices fetched from the cloud', () => {
    const cloud = [
      { serial: deviceA.serial, name: 'Bedroom', productType: '438', localCredentials: 'fresh' },
      { serial: 'NEW-EU-NEW0004N', name: 'New', productType: '438', localCredentials: 'n' },
    ];
    const saved = [{ ...deviceA, temperatureOffset: -1.5, useFahrenheit: true, isNightModeEnabled: false }];

    expect(plain(withSavedDeviceSettings(cloud, saved))).toEqual([
      { ...cloud[0], temperatureOffset: -1.5, useFahrenheit: true },
      cloud[1],
    ]);
  });

  it('keeps values the cloud device already has and tolerates missing lists', () => {
    const cloud = [{ serial: deviceB.serial, heatingServiceType: 'thermostat' }];
    const saved = [{ serial: deviceB.serial, heatingServiceType: 'heater' }];

    expect(plain(withSavedDeviceSettings(cloud, saved))).toEqual(cloud);
    expect(plain(withSavedDeviceSettings(cloud, undefined))).toEqual(cloud);
    expect(plain(withSavedDeviceSettings(undefined, saved))).toEqual([]);
  });
});
