import { registerAiRoutes } from '@mp-consulting/homebridge-ai-core/plugin';

export const ASSISTANT_PLUGIN_NAME = '@mp-consulting/homebridge-dyson-pure-cool';

/**
 * Dyson background the Assistant gets with every request from this plugin's
 * setup wizard. Keep it short: it is sent with each prompt.
 */
export const DYSON_AI_CONTEXT = [
  'The plugin bridges Dyson purifiers and fans (Pure Cool, Hot+Cool HP, Humidify+Cool PH, Big+Quiet) to HomeKit.',
  'The Dyson account is only used once, in the setup wizard, to download each device\'s local MQTT credentials from',
  'the Dyson cloud (appapi.cp.dyson.com): it checks the account status, emails a 6-digit verification code, then reads',
  'the device manifest. The country must match the account\'s Dyson market, or the code is issued for the wrong',
  'region. Wizard errors: "Account not active or not found" (wrong email or country), "Unable to authenticate" (Dyson',
  'rejected the login; the password is checked together with the code), "Invalid verification code", "No pending authentication" (the code request expired after 10 minutes,',
  'start again), "Session expired" (the cloud token was rejected while listing devices), "Request timed out" or',
  '"Network error" (the Homebridge host cannot reach the Dyson cloud), "Invalid response from Dyson API". After setup',
  'everything is local: the plugin finds each device over mDNS (_dyson_mqtt._tcp) or uses its saved "ipAddress", and',
  'connects to the device\'s MQTT broker on TCP port 1883 with the serial number as user name and the local credential',
  'as password. "Device <serial> not found on network" means mDNS did not see it and no IP worked: the device must be',
  'on the same subnet (VLANs, client isolation or mDNS filtering block discovery), so set a DHCP reservation and its',
  'IP. "Connection timeout" or "Timeout waiting for device state" means the device did not answer on port 1883',
  '(offline, weak Wi-Fi, firewall, or a changed IP); "Not authorized" or "Bad user name or password" means the saved',
  'local credential is stale, so re-sync the devices from the Dyson account. Older Link models (HP02, TP02, DP01) and',
  'newer models (HP04+, TP04+) use different MQTT fields. Continuous monitoring ("rhtm") keeps the sensors running while',
  'the fan is off and is needed for sensor updates then; "pollingInterval" sets how often state is requested;',
  'temperatureOffset and humidityOffset calibrate readings. Never ask the user for their password, verification',
  'codes, local credentials, tokens or API keys.',
].join(' ');

/**
 * Adds the Assistant routes (/ai/status, /ai/explain, /ai/ask, /ai/config) to the
 * plugin UI server. The provider settings come from the shared `HomebridgeAiKit`
 * block in config.json; the key never reaches the browser.
 *
 * `options` is passed through to `registerAiRoutes` (tests inject a provider).
 */
export function registerAssistant(server, options = {}) {
  registerAiRoutes(server, {
    pluginName: ASSISTANT_PLUGIN_NAME,
    systemContext: DYSON_AI_CONTEXT,
    ...options,
  });
}
