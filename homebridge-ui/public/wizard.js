/**
 * Dyson Pure Cool - Configuration Wizard
 */

(async () => {
  // =============================================================================
  // Dark Mode Detection
  // =============================================================================

  // Detect dark mode from Homebridge parent window or system preference
  function detectDarkMode() {
    let isDarkMode = false;

    // Method 1: Check parent window's body class
    try {
      if (window.parent && window.parent.document && window.parent.document.body) {
        isDarkMode = window.parent.document.body.classList.contains('dark-mode');
      }
    } catch (e) {
      // Cross-origin access blocked
    }

    // Method 2: Check URL parameter (Homebridge may pass theme info)
    if (!isDarkMode) {
      const urlParams = new URLSearchParams(window.location.search);
      isDarkMode = urlParams.get('theme') === 'dark';
    }

    // Method 3: Fall back to system preference
    if (!isDarkMode && window.matchMedia) {
      isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
      document.body?.classList.add('dark-mode');
    }
  }

  // Run immediately and also when DOM is ready
  detectDarkMode();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', detectDarkMode);
  }

  // =============================================================================
  // Homebridge API Wrapper
  // =============================================================================

  const hb = createHomebridgeWrapper();

  function createHomebridgeWrapper() {
    const safeCall = (method, fallback) => (...args) => {
      if (typeof homebridge !== 'undefined' && typeof homebridge[method] === 'function') {
        return homebridge[method](...args);
      }
      return fallback?.(...args);
    };

    const safeToast = (type) => (msg, title) => {
      if (typeof homebridge !== 'undefined' && homebridge.toast?.[type]) {
        homebridge.toast[type](msg, title);
      } else {
        console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](`${type}:`, msg);
        if (type === 'error') alert(msg);
      }
    };

    return {
      disableSaveButton: safeCall('disableSaveButton'),
      enableSaveButton: safeCall('enableSaveButton'),
      showSpinner: safeCall('showSpinner'),
      hideSpinner: safeCall('hideSpinner'),
      closeSettings: safeCall('closeSettings'),
      getPluginConfig: safeCall('getPluginConfig', () => []),
      updatePluginConfig: safeCall('updatePluginConfig'),
      savePluginConfig: safeCall('savePluginConfig'),
      request: async (path, payload) => {
        if (typeof homebridge !== 'undefined' && typeof homebridge.request === 'function') {
          return homebridge.request(path, payload);
        }
        throw new Error('Homebridge API not available');
      },
      toast: {
        success: safeToast('success'),
        error: safeToast('error'),
        warning: safeToast('warning'),
        info: safeToast('info'),
      },
    };
  }

  // =============================================================================
  // State & Elements
  // =============================================================================

  const state = {
    currentStep: 1,
    authToken: null,
    devices: [],
    selectedDevices: new Set(),
    isSubmitting: false,
    existingConfig: null,
  };

  let productTypes = {};
  let heatingProductTypes = [];

  const $ = (id) => document.getElementById(id);

  const el = {
    steps: {
      0: $('step-0'),
      1: $('step-1'),
      '1b': $('step-1b'),
      2: $('step-2'),
      3: $('step-3'),
      success: $('step-success'),
    },
    progress: $('step-progress'),
    existingDeviceList: $('existing-device-list'),
    deviceList: $('device-list'),
    email: $('email'),
    password: $('password'),
    country: $('country'),
    otpCode: $('otp-code'),
    options: {
      temperature: $('opt-temperature'),
      humidity: $('opt-humidity'),
      airQuality: $('opt-air-quality'),
      nightMode: $('opt-night-mode'),
      autoMode: $('opt-auto-mode'),
      filterStatus: $('opt-filter-status'),
      polling: $('opt-polling'),
    },
    buttons: {
      editOptions: $('btn-edit-options'),
      resync: $('btn-resync'),
      connect: $('btn-connect'),
      backToLogin: $('btn-back-to-login'),
      verifyOtp: $('btn-verify-otp'),
      backToAccount: $('btn-back-to-account'),
      toOptions: $('btn-to-options'),
      backToDevices: $('btn-back-to-devices'),
      save: $('btn-save'),
      close: $('btn-close'),
    },
  };

  // =============================================================================
  // UI Helpers
  // =============================================================================

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function setButtonLoading(button, loading) {
    const text = button.querySelector('.btn-text');
    const spinner = button.querySelector('.spinner-border');
    button.disabled = loading;
    text?.classList.toggle('d-none', loading);
    spinner?.classList.toggle('d-none', !loading);
  }

  function goToStep(step) {
    // Hide all, show target
    Object.values(el.steps).forEach((s) => s.classList.remove('active'));
    el.steps[step].classList.add('active');

    // Update progress bar
    const numericStep = step === 0 || step === '1b' ? 1 : step === 'success' ? 4 : step;
    el.progress.querySelectorAll('li').forEach((li, i) => {
      li.classList.remove('active', 'completed');
      if (i + 1 < numericStep) li.classList.add('completed');
      else if (i + 1 === numericStep) li.classList.add('active');
    });
    el.progress.querySelectorAll('.step-connector').forEach((c, i) => {
      c.classList.toggle('completed', i < numericStep - 1);
    });

    state.currentStep = step;
  }

  // =============================================================================
  // Rendering
  // =============================================================================

  function renderDeviceCard(device, isSelectable = false) {
    const selected = state.selectedDevices.has(device.serial);
    const typeName = productTypes[device.productType] || device.productType;
    const defaultName = typeName || 'Dyson Device';
    // Use hasHeating from device catalog (set by server from getDeviceFeatures)
    const hasHeating = device.hasHeating === true;
    const heatingServiceType = device.heatingServiceType || 'thermostat';
    // Continuous monitoring is available on all devices
    const continuousMonitoring = device.isContinuousMonitoringEnabled === true;

    return `
      <div class="device-card ${selected ? 'selected' : ''}" ${isSelectable ? `data-serial="${device.serial}"` : ''}>
        <div class="d-flex align-items-center ${isSelectable ? 'position-relative' : ''}">
          <div class="device-icon">&#127744;</div>
          <div class="flex-grow-1">
            ${isSelectable
              ? `<input type="text" class="form-control form-control-sm device-name-input mb-1"
                   data-serial="${device.serial}"
                   value="${escapeHtml(device.name || '')}"
                   placeholder="${escapeHtml(defaultName)}"
                   onclick="event.stopPropagation()">`
              : `<div class="device-name">${escapeHtml(device.name || defaultName)}</div>`}
            <div class="device-type">${escapeHtml(typeName)}</div>
            <div class="device-serial">${escapeHtml(device.serial)}${device.ipAddress ? ` • ${escapeHtml(device.ipAddress)}` : ''}</div>
            ${isSelectable ? `
              <div class="mt-2" onclick="event.stopPropagation()">
                <div class="form-check form-switch">
                  <input class="form-check-input continuous-monitoring-check" type="checkbox" role="switch"
                    data-serial="${device.serial}" ${continuousMonitoring ? 'checked' : ''}>
                  <label class="form-check-label small">
                    Continuous Monitoring
                    <span class="text-muted d-block" style="font-size: 0.75em;">Keep sensors active when off (required for HomeKit control while off)</span>
                  </label>
                </div>
              </div>
            ` : ''}
            ${hasHeating && isSelectable ? `
              <div class="mt-2" onclick="event.stopPropagation()">
                <label class="form-label small text-muted mb-1">Heating Service</label>
                <select class="form-select form-select-sm heating-service-select" data-serial="${device.serial}">
                  <option value="thermostat" ${heatingServiceType === 'thermostat' ? 'selected' : ''}>Thermostat (Recommended)</option>
                  <option value="heater-cooler" ${heatingServiceType === 'heater-cooler' ? 'selected' : ''}>Heater Cooler</option>
                  <option value="both" ${heatingServiceType === 'both' ? 'selected' : ''}>Both</option>
                </select>
              </div>
            ` : ''}
          </div>
          ${isSelectable
            ? `<div class="form-check"><input class="form-check-input" type="checkbox" ${selected ? 'checked' : ''}></div>`
            : '<span class="badge bg-success">Configured</span>'}
        </div>
      </div>
    `;
  }

  // Auto-save config when on step 0 (existing config view)
  async function autoSaveConfig() {
    if (state.currentStep !== 0) return;
    try {
      await hb.updatePluginConfig([buildConfig()]);
      await hb.savePluginConfig();
      hb.toast.success('Settings saved');
    } catch (error) {
      hb.toast.error('Failed to save: ' + (error.message || 'Unknown error'));
    }
  }

  // Debounce helper for auto-save
  let autoSaveTimeout = null;
  function debouncedAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(autoSaveConfig, 500);
  }

  // Fetch continuous monitoring state from device
  async function fetchDeviceContinuousMonitoring(device, checkbox) {
    try {
      checkbox.disabled = true;
      const response = await hb.request('/get-device-state', {
        serial: device.serial,
        productType: device.productType,
        localCredentials: device.localCredentials,
        ipAddress: device.ipAddress, // Use cached IP if available
      });
      checkbox.checked = response.continuousMonitoring;
      device.isContinuousMonitoringEnabled = response.continuousMonitoring;

      // Save discovered IP to device config for future use
      if (response.discoveredIp && response.discoveredIp !== device.ipAddress) {
        device.ipAddress = response.discoveredIp;
        console.log(`[Wizard] Cached IP ${response.discoveredIp} for ${device.serial}`);
        debouncedAutoSave();
      }
    } catch (error) {
      console.warn(`Failed to fetch state for ${device.serial}:`, error.message);
      // Keep default value on error
    } finally {
      checkbox.disabled = false;
    }
  }

  function renderExistingDevices(devices) {
    el.existingDeviceList.innerHTML = devices.map((d) => renderDeviceCard(d, true)).join('');

    // Handle name input changes for existing devices (with auto-save)
    el.existingDeviceList.querySelectorAll('.device-name-input').forEach((input) => {
      input.addEventListener('input', (e) => {
        const serial = e.target.dataset.serial;
        const device = state.devices.find((d) => d.serial === serial);
        if (device) {
          device.name = e.target.value.trim();
          debouncedAutoSave();
        }
      });
    });

    // Handle continuous monitoring checkbox changes for existing devices
    // This sends the command directly to the device via MQTT
    el.existingDeviceList.querySelectorAll('.continuous-monitoring-check').forEach((checkbox) => {
      const serial = checkbox.dataset.serial;
      const device = state.devices.find((d) => d.serial === serial);

      // Fetch initial state from device
      if (device) {
        fetchDeviceContinuousMonitoring(device, checkbox);
      }

      checkbox.addEventListener('change', async (e) => {
        const dev = state.devices.find((d) => d.serial === e.target.dataset.serial);
        if (!dev) return;

        const enabled = e.target.checked;
        checkbox.disabled = true;

        try {
          const response = await hb.request('/set-continuous-monitoring', {
            serial: dev.serial,
            productType: dev.productType,
            localCredentials: dev.localCredentials,
            ipAddress: dev.ipAddress, // Use cached IP if available
            enabled,
          });
          hb.toast.success(`Continuous monitoring ${enabled ? 'enabled' : 'disabled'}`);

          // Save discovered IP to device config for future use
          if (response.discoveredIp && response.discoveredIp !== dev.ipAddress) {
            dev.ipAddress = response.discoveredIp;
            debouncedAutoSave();
          }
        } catch (error) {
          // Revert checkbox on error
          checkbox.checked = !enabled;
          hb.toast.error(error.message || 'Failed to set continuous monitoring');
        } finally {
          checkbox.disabled = false;
        }
      });
    });

    // Handle heating service type changes for existing devices (with auto-save)
    el.existingDeviceList.querySelectorAll('.heating-service-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        const serial = e.target.dataset.serial;
        const device = state.devices.find((d) => d.serial === serial);
        if (device) {
          device.heatingServiceType = e.target.value;
          autoSaveConfig();
        }
      });
    });

    // Make cards non-clickable for selection (just show as configured)
    el.existingDeviceList.querySelectorAll('.device-card').forEach((card) => {
      card.style.cursor = 'default';
      const checkbox = card.querySelector('input[type="checkbox"]:not(.continuous-monitoring-check)');
      if (checkbox) {
        checkbox.style.display = 'none';
      }
    });
  }

  function renderDeviceList() {
    el.deviceList.innerHTML = state.devices.map((d) => renderDeviceCard(d, true)).join('');

    // Handle card selection
    el.deviceList.querySelectorAll('.device-card').forEach((card) => {
      card.addEventListener('click', () => {
        const serial = card.dataset.serial;
        const checkbox = card.querySelector('input[type="checkbox"]:not(.continuous-monitoring-check)');
        const isSelected = state.selectedDevices.has(serial);

        if (isSelected) {
          state.selectedDevices.delete(serial);
        } else {
          state.selectedDevices.add(serial);
        }

        card.classList.toggle('selected', !isSelected);
        checkbox.checked = !isSelected;
      });
    });

    // Handle name input changes
    el.deviceList.querySelectorAll('.device-name-input').forEach((input) => {
      input.addEventListener('input', (e) => {
        const serial = e.target.dataset.serial;
        const device = state.devices.find((d) => d.serial === serial);
        if (device) {
          device.name = e.target.value.trim();
        }
      });
    });

    // Handle continuous monitoring checkbox changes
    // This sends the command directly to the device via MQTT
    el.deviceList.querySelectorAll('.continuous-monitoring-check').forEach((checkbox) => {
      checkbox.addEventListener('change', async (e) => {
        const serial = e.target.dataset.serial;
        const device = state.devices.find((d) => d.serial === serial);
        if (!device) return;

        const enabled = e.target.checked;
        checkbox.disabled = true;

        try {
          const response = await hb.request('/set-continuous-monitoring', {
            serial: device.serial,
            productType: device.productType,
            localCredentials: device.localCredentials,
            ipAddress: device.ipAddress, // Use cached IP if available
            enabled,
          });
          hb.toast.success(`Continuous monitoring ${enabled ? 'enabled' : 'disabled'}`);

          // Save discovered IP to device config for future use
          if (response.discoveredIp && response.discoveredIp !== device.ipAddress) {
            device.ipAddress = response.discoveredIp;
          }
        } catch (error) {
          // Revert checkbox on error
          checkbox.checked = !enabled;
          hb.toast.error(error.message || 'Failed to set continuous monitoring');
        } finally {
          checkbox.disabled = false;
        }
      });
    });

    // Handle heating service type changes
    el.deviceList.querySelectorAll('.heating-service-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        const serial = e.target.dataset.serial;
        const device = state.devices.find((d) => d.serial === serial);
        if (device) {
          device.heatingServiceType = e.target.value;
        }
      });
    });
  }

  // =============================================================================
  // Config
  // =============================================================================

  function loadExistingConfig(config) {
    const opts = el.options;

    if (config.enableTemperature !== undefined) opts.temperature.checked = config.enableTemperature;
    if (config.enableHumidity !== undefined) opts.humidity.checked = config.enableHumidity;
    if (config.enableAirQuality !== undefined) opts.airQuality.checked = config.enableAirQuality;
    if (config.enableNightMode !== undefined) opts.nightMode.checked = config.enableNightMode;
    if (config.enableAutoMode !== undefined) opts.autoMode.checked = config.enableAutoMode;
    if (config.enableFilterStatus !== undefined) opts.filterStatus.checked = config.enableFilterStatus;
    if (config.pollingInterval) opts.polling.value = config.pollingInterval;
    if (config.countryCode) el.country.value = config.countryCode;

    if (config.devices) {
      state.devices = config.devices.map((d) => ({
        ...d,
        productName: productTypes[d.productType] || `Unknown (${d.productType})`,
        // Set hasHeating from catalog for existing devices
        hasHeating: heatingProductTypes.includes(d.productType),
      }));
      state.selectedDevices = new Set(config.devices.map((d) => d.serial));
    }
  }

  function buildConfig() {
    const selectedDevices = state.devices.filter((d) => state.selectedDevices.has(d.serial));
    const opts = el.options;

    return {
      platform: 'DysonPureCool',
      name: 'Dyson Pure Cool',
      countryCode: el.country.value,
      devices: selectedDevices.map((d) => {
        const deviceConfig = {
          serial: d.serial,
          name: d.name,
          productType: d.productType,
          localCredentials: d.localCredentials,
        };
        // Include cached IP address if available
        if (d.ipAddress) {
          deviceConfig.ipAddress = d.ipAddress;
        }
        // Include continuous monitoring if enabled
        if (d.isContinuousMonitoringEnabled) {
          deviceConfig.isContinuousMonitoringEnabled = true;
        }
        // Only include heatingServiceType for devices that support heating
        if (d.hasHeating && d.heatingServiceType) {
          deviceConfig.heatingServiceType = d.heatingServiceType;
        }
        return deviceConfig;
      }),
      enableTemperature: opts.temperature.checked,
      enableHumidity: opts.humidity.checked,
      enableAirQuality: opts.airQuality.checked,
      enableNightMode: opts.nightMode.checked,
      enableAutoMode: opts.autoMode.checked,
      enableFilterStatus: opts.filterStatus.checked,
      pollingInterval: parseInt(opts.polling.value, 10) || 60,
    };
  }

  // =============================================================================
  // API Handlers
  // =============================================================================

  async function handleConnect() {
    const email = el.email.value.trim();
    const password = el.password.value;
    const countryCode = el.country.value;

    if (!email || !password) {
      hb.toast.error('Please enter your email and password');
      return;
    }

    setButtonLoading(el.buttons.connect, true);

    try {
      const response = await hb.request('/authenticate', { email, password, countryCode });

      if (response.requires2FA) {
        hb.toast.info('Check your email for a verification code');
        goToStep('1b');
        el.otpCode.focus();
      } else {
        state.authToken = response.token;
        await fetchDevices();
      }
    } catch (error) {
      hb.toast.error(error.message || 'Authentication failed');
    } finally {
      setButtonLoading(el.buttons.connect, false);
    }
  }

  async function handleVerifyOtp() {
    if (state.isSubmitting) return;

    const otpCode = el.otpCode.value.trim();
    if (!otpCode || otpCode.length < 6) {
      hb.toast.error('Please enter the 6-digit verification code');
      return;
    }

    state.isSubmitting = true;
    setButtonLoading(el.buttons.verifyOtp, true);

    try {
      const response = await hb.request('/verify-otp', { otpCode });
      state.authToken = response.token;
      hb.toast.success('Verification successful!');
      await fetchDevices();
    } catch (error) {
      hb.toast.error(error.message || 'Verification failed');
      el.otpCode.value = '';
      el.otpCode.focus();
    } finally {
      state.isSubmitting = false;
      setButtonLoading(el.buttons.verifyOtp, false);
    }
  }

  async function fetchDevices() {
    hb.showSpinner();

    try {
      const response = await hb.request('/get-devices', { token: state.authToken });
      state.devices = response.devices;

      if (state.devices.length === 0) {
        hb.toast.warning('No compatible devices found');
        return;
      }

      state.selectedDevices = new Set(state.devices.map((d) => d.serial));
      renderDeviceList();
      goToStep(2);
      hb.toast.success(`Found ${state.devices.length} device(s)!`);
    } catch (error) {
      hb.toast.error(error.message || 'Failed to fetch devices');
      goToStep(1);
    } finally {
      hb.hideSpinner();
    }
  }

  async function handleSave() {
    setButtonLoading(el.buttons.save, true);

    try {
      await hb.updatePluginConfig([buildConfig()]);
      await hb.savePluginConfig();
      hb.toast.success('Configuration saved!');
      hb.enableSaveButton();
      goToStep('success');
    } catch (error) {
      hb.toast.error(error.message || 'Failed to save configuration');
    } finally {
      setButtonLoading(el.buttons.save, false);
    }
  }

  // =============================================================================
  // Event Bindings
  // =============================================================================

  function bindEvents() {
    const { buttons } = el;

    // Step 0
    buttons.editOptions.addEventListener('click', () => goToStep(3));
    buttons.resync.addEventListener('click', () => goToStep(1));

    // Step 1
    buttons.connect.addEventListener('click', handleConnect);
    el.email.addEventListener('keypress', (e) => e.key === 'Enter' && el.password.focus());
    el.password.addEventListener('keypress', (e) => e.key === 'Enter' && handleConnect());

    // Step 1b
    buttons.backToLogin.addEventListener('click', () => goToStep(1));
    buttons.verifyOtp.addEventListener('click', handleVerifyOtp);
    el.otpCode.addEventListener('keypress', (e) => e.key === 'Enter' && handleVerifyOtp());
    el.otpCode.addEventListener('input', (e) => e.target.value.length === 6 && handleVerifyOtp());

    // Step 2
    buttons.backToAccount.addEventListener('click', () => goToStep(state.existingConfig ? 0 : 1));
    buttons.toOptions.addEventListener('click', () => {
      if (state.selectedDevices.size === 0) {
        hb.toast.warning('Please select at least one device');
        return;
      }
      goToStep(3);
    });

    // Step 3
    buttons.backToDevices.addEventListener('click', () => {
      goToStep(state.existingConfig && !state.authToken ? 0 : 2);
    });
    buttons.save.addEventListener('click', handleSave);

    // Success
    buttons.close.addEventListener('click', () => hb.closeSettings());
  }

  // =============================================================================
  // Init
  // =============================================================================

  async function init() {
    hb.disableSaveButton();

    // Load product types and heating capability info from device catalog
    try {
      const response = await hb.request('/get-product-types', {});
      if (response.success) {
        productTypes = response.productTypes;
        heatingProductTypes = response.heatingProductTypes || [];
      }
    } catch (e) {
      console.warn('Failed to load product types:', e);
    }

    // Load existing config
    const configs = await hb.getPluginConfig();
    if (configs.length > 0 && configs[0].devices?.length > 0) {
      state.existingConfig = configs[0];
      loadExistingConfig(configs[0]);
      renderExistingDevices(state.devices);
      goToStep(0);
    } else {
      goToStep(1);
    }

    bindEvents();
  }

  init();
})();
