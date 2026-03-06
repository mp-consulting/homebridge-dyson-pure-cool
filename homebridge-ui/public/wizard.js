/**
 * Dyson Pure Cool - Configuration Wizard
 */

(async () => {
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
    isResync: false,
  };

  let productTypes = {};
  let heatingProductTypes = [];
  let jetFocusProductTypes = [];

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
    errorLogin: $('error-login'),
    errorOtp: $('error-otp'),
    loginResyncHint: $('login-resync-hint'),
    cancelResync: $('btn-cancel-resync'),
    options: {
      temperature: $('opt-temperature'),
      humidity: $('opt-humidity'),
      airQuality: $('opt-air-quality'),
      nightMode: $('opt-night-mode'),
      jetFocus: $('opt-jet-focus'),
      autoMode: $('opt-auto-mode'),
      filterStatus: $('opt-filter-status'),
      polling: $('opt-polling'),
    },
    buttons: {
      editOptions: $('btn-edit-options'),
      resync: $('btn-resync'),
      connect: $('btn-connect'),
      togglePassword: $('btn-toggle-password'),
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

  function showInlineError(errorEl, message) {
    errorEl.textContent = message;
    errorEl.classList.remove('d-none');
  }

  function hideInlineError(errorEl) {
    errorEl.classList.add('d-none');
    errorEl.textContent = '';
  }

  function goToStep(step) {
    // Hide all, show target
    Object.values(el.steps).forEach((s) => s.classList.remove('active'));
    el.steps[step].classList.add('active');

    // Hide progress bar on step 0 (already configured)
    el.progress.classList.toggle('d-none', step === 0);

    // Clear inline errors when navigating
    hideInlineError(el.errorLogin);
    hideInlineError(el.errorOtp);

    // Show/hide resync hint and cancel button on step 1 based on state
    if (step === 1) {
      el.loginResyncHint.classList.toggle('d-none', !state.isResync);
      el.cancelResync.classList.toggle('d-none', !state.isResync);
      if (state.isResync) {
        el.buttons.connect.classList.remove('flex-grow-1');
        el.buttons.connect.classList.add('ms-2');
      } else {
        el.buttons.connect.classList.add('flex-grow-1');
        el.buttons.connect.classList.remove('ms-2');
      }
    }

    // Update options visibility when entering step 3
    if (step === 3) {
      updateOptionsVisibility();
    }

    // Update progress bar
    const numericStep = step === 0 || step === '1b' ? 1 : step === 'success' ? 4 : step;
    el.progress.querySelectorAll('li').forEach((li, i) => {
      li.classList.remove('active', 'completed');
      if (i + 1 < numericStep) {
        li.classList.add('completed');
      } else if (i + 1 === numericStep) {
        li.classList.add('active');
      }
    });
    el.progress.querySelectorAll('.step-connector').forEach((c, i) => {
      c.classList.toggle('completed', i < numericStep - 1);
    });

    state.currentStep = step;
  }

  // =============================================================================
  // Options Visibility (filter by device capabilities)
  // =============================================================================

  function updateOptionsVisibility() {
    const selected = state.devices.filter((d) => state.selectedDevices.has(d.serial));
    // Jet focus: only show if at least one selected device supports it
    const anyJetFocus = selected.some((d) => d.hasJetFocus === true);
    el.options.jetFocus.closest('.form-check').classList.toggle('d-none', !anyJetFocus);
  }

  // =============================================================================
  // Country Auto-Detection
  // =============================================================================

  function detectCountry() {
    try {
      const lang = navigator.language || '';
      const match = lang.match(/-([A-Z]{2})$/i);
      if (match) {
        const code = match[1].toUpperCase();
        if (el.country.querySelector(`option[value="${code}"]`)) {
          return code;
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // =============================================================================
  // Rendering
  // =============================================================================

  function renderDeviceCard(device, isSelectable = false, showRemove = false) {
    const selected = state.selectedDevices.has(device.serial);
    const typeName = productTypes[device.productType] || device.productType;
    const defaultName = typeName || 'Dyson Device';
    const hasHeating = device.hasHeating === true;
    const heatingServiceType = device.heatingServiceType || 'thermostat';
    const continuousMonitoring = device.isContinuousMonitoringEnabled === true;
    const collapseId = `device-settings-${device.serial.replace(/[^a-zA-Z0-9]/g, '-')}`;

    const versionBadge = device.version
      ? `<span class="badge bg-secondary fw-normal">${escapeHtml(device.version)}</span>`
      : '';
    const updateBadge = device.newVersionAvailable
      ? '<span class="badge bg-warning text-dark fw-normal ms-1"><i class="bi bi-arrow-up-circle me-1"></i>Update available</span>'
      : '';

    const actionEl = showRemove
      ? `<button class="btn btn-sm btn-outline-danger flex-shrink-0" data-remove-serial="${escapeHtml(device.serial)}" title="Remove device">
           <i class="bi bi-trash"></i>
         </button>`
      : isSelectable
        ? `<div class="form-check flex-shrink-0">
             <input class="form-check-input" type="checkbox" ${selected ? 'checked' : ''}>
           </div>`
        : '<span class="badge bg-success flex-shrink-0">Configured</span>';

    const settingsPanel = isSelectable ? `
      <div class="collapse" id="${collapseId}" onclick="event.stopPropagation()">
        <div class="border-top mt-2 pt-2">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input continuous-monitoring-check" type="checkbox" role="switch"
              data-serial="${escapeHtml(device.serial)}" ${continuousMonitoring ? 'checked' : ''}>
            <label class="form-check-label small">
              Continuous Monitoring
              <span class="text-muted d-block" style="font-size: 0.75em;">Keep sensors active when off (required for HomeKit control while off)</span>
            </label>
          </div>
          ${hasHeating ? `
            <label class="form-label small text-muted mb-1">Heating Service</label>
            <select class="form-select form-select-sm heating-service-select" data-serial="${escapeHtml(device.serial)}">
              <option value="thermostat" ${heatingServiceType === 'thermostat' ? 'selected' : ''}>Thermostat (Recommended)</option>
              <option value="heater-cooler" ${heatingServiceType === 'heater-cooler' ? 'selected' : ''}>Heater Cooler</option>
              <option value="both" ${heatingServiceType === 'both' ? 'selected' : ''}>Both</option>
            </select>
          ` : ''}
        </div>
      </div>
    ` : '';

    return `
      <div class="device-card${selected && isSelectable && !showRemove ? ' selected' : ''}${showRemove ? ' device-card-static' : ''}"
           ${isSelectable ? `data-serial="${escapeHtml(device.serial)}"` : ''}>
        <div class="d-flex align-items-center gap-3">
          <div class="device-icon flex-shrink-0"><i class="bi bi-wind"></i></div>
          <div class="flex-grow-1 min-w-0">
            ${isSelectable
              ? `<input type="text" class="form-control form-control-sm device-name-input mb-1"
                   data-serial="${escapeHtml(device.serial)}"
                   value="${escapeHtml(device.name || '')}"
                   placeholder="${escapeHtml(defaultName)}"
                   onclick="event.stopPropagation()">`
              : `<div class="device-name">${escapeHtml(device.name || defaultName)}</div>`}
            <div class="device-type">${escapeHtml(typeName)}</div>
            <div class="device-serial">${escapeHtml(device.serial)}${device.ipAddress ? ` <span class="text-muted">• ${escapeHtml(device.ipAddress)}</span>` : ''}</div>
            ${device.version ? `<div class="device-meta mt-1">${versionBadge}${updateBadge}</div>` : ''}
          </div>
          ${isSelectable ? `
            <button class="btn btn-sm btn-outline-secondary flex-shrink-0"
                    data-bs-toggle="collapse" data-bs-target="#${collapseId}"
                    onclick="event.stopPropagation()" title="Device settings">
              <i class="bi bi-gear"></i>
            </button>
          ` : ''}
          ${actionEl}
        </div>
        ${settingsPanel}
      </div>
    `;
  }

  // Auto-save config when on step 0 (existing config view)
  async function autoSaveConfig() {
    if (state.currentStep !== 0) {
      return;
    }
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
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
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
        ipAddress: device.ipAddress,
      });
      checkbox.checked = response.continuousMonitoring;
      device.isContinuousMonitoringEnabled = response.continuousMonitoring;

      if (response.discoveredIp && response.discoveredIp !== device.ipAddress) {
        device.ipAddress = response.discoveredIp;
        console.log(`[Wizard] Cached IP ${response.discoveredIp} for ${device.serial}`);
        debouncedAutoSave();
      }
    } catch (error) {
      console.warn(`Failed to fetch state for ${device.serial}:`, error.message);
    } finally {
      checkbox.disabled = false;
    }
  }

  function renderExistingDevices(devices) {
    if (devices.length === 0) {
      el.existingDeviceList.innerHTML = `
        <div class="text-center text-muted py-3">
          <i class="bi bi-wind fs-2 d-block mb-2 opacity-50"></i>
          No devices configured. Click <strong>Re-sync</strong> to add devices.
        </div>`;
      return;
    }

    el.existingDeviceList.innerHTML = devices.map((d) => renderDeviceCard(d, true, true)).join('');

    // Handle remove button clicks
    el.existingDeviceList.querySelectorAll('[data-remove-serial]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const serial = btn.dataset.removeSerial;
        state.devices = state.devices.filter((d) => d.serial !== serial);
        state.selectedDevices.delete(serial);
        renderExistingDevices(state.devices);
        autoSaveConfig();
      });
    });

    // Handle name input changes
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

    // Handle continuous monitoring checkbox changes
    el.existingDeviceList.querySelectorAll('.continuous-monitoring-check').forEach((checkbox) => {
      const serial = checkbox.dataset.serial;
      const device = state.devices.find((d) => d.serial === serial);

      if (device) {
        fetchDeviceContinuousMonitoring(device, checkbox);
      }

      checkbox.addEventListener('change', async (e) => {
        const dev = state.devices.find((d) => d.serial === e.target.dataset.serial);
        if (!dev) {
          return;
        }

        const enabled = e.target.checked;
        checkbox.disabled = true;

        try {
          const response = await hb.request('/set-continuous-monitoring', {
            serial: dev.serial,
            productType: dev.productType,
            localCredentials: dev.localCredentials,
            ipAddress: dev.ipAddress,
            enabled,
          });
          hb.toast.success(`Continuous monitoring ${enabled ? 'enabled' : 'disabled'}`);

          if (response.discoveredIp && response.discoveredIp !== dev.ipAddress) {
            dev.ipAddress = response.discoveredIp;
            debouncedAutoSave();
          }
        } catch (error) {
          checkbox.checked = !enabled;
          hb.toast.error(error.message || 'Failed to set continuous monitoring');
        } finally {
          checkbox.disabled = false;
        }
      });
    });

    // Handle heating service type changes
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
    el.deviceList.querySelectorAll('.continuous-monitoring-check').forEach((checkbox) => {
      checkbox.addEventListener('change', async (e) => {
        const serial = e.target.dataset.serial;
        const device = state.devices.find((d) => d.serial === serial);
        if (!device) {
          return;
        }

        const enabled = e.target.checked;
        checkbox.disabled = true;

        try {
          const response = await hb.request('/set-continuous-monitoring', {
            serial: device.serial,
            productType: device.productType,
            localCredentials: device.localCredentials,
            ipAddress: device.ipAddress,
            enabled,
          });
          hb.toast.success(`Continuous monitoring ${enabled ? 'enabled' : 'disabled'}`);

          if (response.discoveredIp && response.discoveredIp !== device.ipAddress) {
            device.ipAddress = response.discoveredIp;
          }
        } catch (error) {
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

    if (config.enableTemperature !== undefined) {
      opts.temperature.checked = config.enableTemperature;
    }
    if (config.enableHumidity !== undefined) {
      opts.humidity.checked = config.enableHumidity;
    }
    if (config.enableAirQuality !== undefined) {
      opts.airQuality.checked = config.enableAirQuality;
    }
    if (config.enableNightMode !== undefined) {
      opts.nightMode.checked = config.enableNightMode;
    }
    if (config.enableJetFocus !== undefined) {
      opts.jetFocus.checked = config.enableJetFocus;
    }
    if (config.enableAutoMode !== undefined) {
      opts.autoMode.checked = config.enableAutoMode;
    }
    if (config.enableFilterStatus !== undefined) {
      opts.filterStatus.checked = config.enableFilterStatus;
    }
    if (config.pollingInterval) {
      opts.polling.value = config.pollingInterval;
    }
    if (config.countryCode) {
      el.country.value = config.countryCode;
    }

    if (config.devices) {
      state.devices = config.devices.map((d) => ({
        ...d,
        productName: productTypes[d.productType] || `Unknown (${d.productType})`,
        hasHeating: heatingProductTypes.includes(d.productType),
        hasJetFocus: jetFocusProductTypes.includes(d.productType),
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
        if (d.ipAddress) {
          deviceConfig.ipAddress = d.ipAddress;
        }
        if (d.isContinuousMonitoringEnabled) {
          deviceConfig.isContinuousMonitoringEnabled = true;
        }
        if (d.hasHeating && d.heatingServiceType) {
          deviceConfig.heatingServiceType = d.heatingServiceType;
        }
        return deviceConfig;
      }),
      enableTemperature: opts.temperature.checked,
      enableHumidity: opts.humidity.checked,
      enableAirQuality: opts.airQuality.checked,
      enableNightMode: opts.nightMode.checked,
      enableJetFocus: opts.jetFocus.checked,
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
      showInlineError(el.errorLogin, 'Please enter your email and password');
      return;
    }

    setButtonLoading(el.buttons.connect, true);

    try {
      const response = await hb.request('/authenticate', { email, password, countryCode });

      if (response.requires2FA) {
        goToStep('1b');
        el.otpCode.focus();
      } else {
        state.authToken = response.token;
        await fetchDevices();
      }
    } catch (error) {
      showInlineError(el.errorLogin, error.message || 'Authentication failed');
    } finally {
      setButtonLoading(el.buttons.connect, false);
    }
  }

  async function handleVerifyOtp() {
    if (state.isSubmitting) {
      return;
    }

    const otpCode = el.otpCode.value.trim();
    if (!otpCode || otpCode.length < 6) {
      showInlineError(el.errorOtp, 'Please enter the 6-digit verification code');
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
      showInlineError(el.errorOtp, error.message || 'Verification failed');
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
      state.isResync = false;

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
    buttons.resync.addEventListener('click', () => {
      state.isResync = true;
      goToStep(1);
      setTimeout(() => el.email.focus(), 50);
    });

    // Step 1
    el.cancelResync.addEventListener('click', () => {
      state.isResync = false;
      goToStep(0);
    });
    buttons.connect.addEventListener('click', handleConnect);
    el.email.addEventListener('input', () => hideInlineError(el.errorLogin));
    el.password.addEventListener('input', () => hideInlineError(el.errorLogin));
    el.email.addEventListener('keypress', (e) => e.key === 'Enter' && el.password.focus());
    el.password.addEventListener('keypress', (e) => e.key === 'Enter' && handleConnect());

    // Password visibility toggle
    buttons.togglePassword.addEventListener('click', () => {
      const isPassword = el.password.type === 'password';
      el.password.type = isPassword ? 'text' : 'password';
      buttons.togglePassword.querySelector('i').className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
    });

    // Step 1b
    buttons.backToLogin.addEventListener('click', () => goToStep(1));
    buttons.verifyOtp.addEventListener('click', handleVerifyOtp);
    el.otpCode.addEventListener('keypress', (e) => e.key === 'Enter' && handleVerifyOtp());
    el.otpCode.addEventListener('input', (e) => {
      hideInlineError(el.errorOtp);
      if (e.target.value.length === 6) {
        handleVerifyOtp();
      }
    });

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
    // Apply Homebridge theme setting if available
    try {
      const settings = await homebridge.getUserSettings?.();
      if (settings?.theme === 'dark') {
        document.documentElement.dataset.bsTheme = 'dark';
      } else if (settings?.theme === 'light') {
        document.documentElement.dataset.bsTheme = 'light';
      }
    } catch (e) {
      // getUserSettings not available, keep system preference from early detection
    }

    hb.disableSaveButton();

    // Auto-detect country from browser locale (may be overridden by existing config below)
    const detectedCountry = detectCountry();
    if (detectedCountry) {
      el.country.value = detectedCountry;
    }

    // Load product types, heating, and jet focus capability info from device catalog
    try {
      const response = await hb.request('/get-product-types', {});
      if (response.success) {
        productTypes = response.productTypes;
        heatingProductTypes = response.heatingProductTypes || [];
        jetFocusProductTypes = response.jetFocusProductTypes || [];
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
