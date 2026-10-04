/**
 * Dyson Pure Cool - merges the setup wizard's output into the saved config.
 *
 * The wizard only renders part of the plugin config. Saving its fields as the
 * whole config dropped everything else (e.g. `isSingleAccessoryModeEnabled`,
 * `enableHeater`, `_bridge`, hand-set per-device overrides), so the wizard's
 * output is merged into the saved block instead:
 *
 * - top-level keys the wizard does not write are kept;
 * - `devices` follows the wizard's list (a device removed in the wizard is
 *   removed), each entry matched to the saved one by serial number, keeping
 *   the saved keys the wizard does not manage.
 *
 * Loaded as a classic script before wizard.js (exposes `DysonConfigMerge`) and
 * by the unit tests. No imports/exports so it runs in both.
 */

(function (root) {
  // Per-device keys edited in the wizard: when the wizard leaves one out, the
  // user turned it off or reset it, so a saved value must not come back.
  const WIZARD_DEVICE_SETTINGS = [
    'isContinuousMonitoringEnabled',
    'heatingServiceType',
    'temperatureOffset',
    'humidityOffset',
    'useFahrenheit',
  ];

  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  function withoutUndefined(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
  }

  function savedDevicesBySerial(savedDevices) {
    const bySerial = new Map();
    for (const device of Array.isArray(savedDevices) ? savedDevices : []) {
      if (isObject(device) && typeof device.serial === 'string' && !bySerial.has(device.serial)) {
        bySerial.set(device.serial, device);
      }
    }
    return bySerial;
  }

  function mergeDevice(saved, built) {
    const kept = { ...saved };
    for (const key of WIZARD_DEVICE_SETTINGS) {
      delete kept[key];
    }
    return { ...kept, ...withoutUndefined(built) };
  }

  /**
   * Returns the platform config to save: `existing` (the saved block, may be
   * undefined) updated with `built` (the wizard's `buildConfig()` output).
   */
  function mergePluginConfig(existing, built) {
    const base = isObject(existing) ? existing : {};
    const saved = savedDevicesBySerial(base.devices);
    const devices = (Array.isArray(built.devices) ? built.devices : []).map((device) => {
      const savedDevice = saved.get(device.serial);
      return savedDevice ? mergeDevice(savedDevice, device) : withoutUndefined(device);
    });
    return { ...base, ...withoutUndefined(built), devices };
  }

  /**
   * Devices fetched from the Dyson cloud carry no wizard settings; copies the
   * saved ones (offsets, heating service, ...) onto them, by serial, so a
   * re-sync does not reset them.
   */
  function withSavedDeviceSettings(cloudDevices, savedDevices) {
    const saved = savedDevicesBySerial(savedDevices);
    return (Array.isArray(cloudDevices) ? cloudDevices : []).map((device) => {
      const savedDevice = isObject(device) ? saved.get(device.serial) : undefined;
      if (!savedDevice) {
        return device;
      }
      const settings = {};
      for (const key of WIZARD_DEVICE_SETTINGS) {
        if (savedDevice[key] !== undefined && device[key] === undefined) {
          settings[key] = savedDevice[key];
        }
      }
      return { ...device, ...settings };
    });
  }

  root.DysonConfigMerge = { mergePluginConfig, withSavedDeviceSettings, WIZARD_DEVICE_SETTINGS };
})(globalThis);
