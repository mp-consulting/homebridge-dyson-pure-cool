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

    return `
      <div class="device-card ${selected ? 'selected' : ''}" ${isSelectable ? `data-serial="${device.serial}"` : ''}>
        <div class="d-flex align-items-center ${isSelectable ? 'position-relative' : ''}">
          <div class="device-icon">&#127744;</div>
          <div class="flex-grow-1">
            <div class="device-name">${escapeHtml(device.name || 'Dyson Device')}</div>
            <div class="device-type">${escapeHtml(typeName)}</div>
            <div class="device-serial">${escapeHtml(device.serial)}</div>
          </div>
          ${isSelectable
            ? `<div class="form-check"><input class="form-check-input" type="checkbox" ${selected ? 'checked' : ''}></div>`
            : '<span class="badge bg-success">Configured</span>'}
        </div>
      </div>
    `;
  }

  function renderExistingDevices(devices) {
    el.existingDeviceList.innerHTML = devices.map((d) => renderDeviceCard(d, false)).join('');
  }

  function renderDeviceList() {
    el.deviceList.innerHTML = state.devices.map((d) => renderDeviceCard(d, true)).join('');

    el.deviceList.querySelectorAll('.device-card').forEach((card) => {
      card.addEventListener('click', () => {
        const serial = card.dataset.serial;
        const checkbox = card.querySelector('input[type="checkbox"]');
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
      devices: selectedDevices.map((d) => ({
        serial: d.serial,
        name: d.name,
        productType: d.productType,
        localCredentials: d.localCredentials,
      })),
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

    // Load product types
    try {
      const response = await hb.request('/get-product-types', {});
      if (response.success) productTypes = response.productTypes;
    } catch (e) {
      console.warn('Failed to load product types:', e);
    }

    // Load existing config
    const configs = await hb.getPluginConfig();
    if (configs.length > 0 && configs[0].devices?.length > 0) {
      state.existingConfig = configs[0];
      loadExistingConfig(configs[0]);
      renderExistingDevices(configs[0].devices);
      goToStep(0);
    } else {
      goToStep(1);
    }

    bindEvents();
  }

  init();
})();
