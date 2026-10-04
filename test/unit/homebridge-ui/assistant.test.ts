import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM module of the custom UI server, no type declarations
import { ASSISTANT_PLUGIN_NAME, DYSON_AI_CONTEXT, registerAssistant } from '../../../homebridge-ui/assistant.js';

interface ChatRequest {
  system?: string;
  messages: Array<{ role: string; content: unknown }>;
}

const usage = { inputTokens: 10, outputTokens: 5 };

/** Provider stand-in: no network, replies with `reply` (streamed in two chunks). */
function fakeProvider(reply: string) {
  const requests: ChatRequest[] = [];
  const result = (text: string) => ({
    text,
    toolCalls: [],
    usage,
    stopReason: 'end',
    model: 'fake-model',
    message: { role: 'assistant', content: text },
  });
  const provider = {
    name: 'anthropic',
    model: 'fake-model',
    capabilities: { tools: false, streaming: true, contextTokens: 100_000, jsonMode: false },
    async chat(request: ChatRequest) {
      requests.push(request);
      return result(reply);
    },
    async *stream(request: ChatRequest) {
      requests.push(request);
      const half = Math.ceil(reply.length / 2);
      yield { type: 'text', delta: reply.slice(0, half) };
      yield { type: 'text', delta: reply.slice(half) };
      yield { type: 'done', usage, stopReason: 'end', result: result(reply) };
    },
  };
  return { provider, requests };
}

function fakeServer(homebridgeConfigPath?: string) {
  const handlers = new Map<string, (body: unknown) => unknown>();
  const events: Array<[string, unknown]> = [];
  const server = {
    homebridgeConfigPath,
    onRequest: (path: string, fn: (body: unknown) => unknown) => handlers.set(path, fn),
    pushEvent: (event: string, data: unknown) => events.push([event, data]),
  };
  const call = (path: string, body: unknown = {}) => Promise.resolve(handlers.get(path)!(body));
  return { server, handlers, events, call };
}

async function writeConfig(platforms: unknown[]) {
  const dir = await mkdtemp(join(tmpdir(), 'dyson-assistant-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ bridge: { name: 'Homebridge' }, platforms }));
  return path;
}

describe('homebridge-ui Assistant routes', () => {
  it('registers the four Assistant routes', () => {
    const ui = fakeServer();
    registerAssistant(ui.server, { loadConfig: async () => null });
    expect([...ui.handlers.keys()].sort()).toEqual(['/ai/ask', '/ai/config', '/ai/explain', '/ai/status']);
  });

  it('reports the Assistant as off when the AI Kit block is missing', async () => {
    const ui = fakeServer(await writeConfig([{ platform: 'DysonPureCool', countryCode: 'GB', devices: [] }]));
    registerAssistant(ui.server);
    expect(await ui.call('/ai/status')).toEqual({ enabled: false, provider: null, model: null, capabilities: null });
    await expect(ui.call('/ai/explain', { error: 'x' })).rejects.toThrow('The Assistant is not set up');
  });

  it('reads the shared HomebridgeAiKit block and never returns its key', async () => {
    const ui = fakeServer(await writeConfig([
      { platform: 'DysonPureCool' },
      { platform: 'HomebridgeAiKit', provider: 'anthropic', apiKey: 'sk-ant-secret-key' },
    ]));
    registerAssistant(ui.server);
    const status = await ui.call('/ai/status');
    expect(status).toMatchObject({ enabled: true, provider: 'anthropic' });
    expect(JSON.stringify(status)).not.toContain('sk-ant-secret-key');
  });

  it('explains a device error with the Dyson context and streams it', async () => {
    const { provider, requests } = fakeProvider('Check port 1883.');
    const ui = fakeServer();
    registerAssistant(ui.server, {
      loadConfig: async () => ({ enabled: true, provider: 'anthropic', model: 'fake-model' }),
      createProvider: () => provider,
    });

    const result = await ui.call('/ai/explain', {
      error: 'Failed to get device state: Connection timeout after 10000ms',
      context: 'Dyson account country: GB.',
      device: { name: 'Bedroom', productType: '438', model: 'Pure Cool Tower', ipAddressSaved: true },
      requestId: 'r1',
    });

    expect(result).toEqual({ text: 'Check port 1883.', usage });
    expect(ui.events).toEqual([
      ['ai:chunk', { requestId: 'r1', delta: 'Check po' }],
      ['ai:chunk', { requestId: 'r1', delta: 'rt 1883.' }],
      ['ai:done', { requestId: 'r1' }],
    ]);
    expect(requests[0].system).toContain(ASSISTANT_PLUGIN_NAME);
    expect(requests[0].system).toContain(DYSON_AI_CONTEXT);
    expect(JSON.stringify(requests[0].messages)).toContain('Pure Cool Tower');
  });

  it('describes the cloud sign-in, local MQTT connection and common errors in its context', () => {
    expect(ASSISTANT_PLUGIN_NAME).toBe('@mp-consulting/homebridge-dyson-pure-cool');
    for (const fact of ['verification code', 'Account not active or not found', 'Session expired', '_dyson_mqtt._tcp', '1883',
      'not found on network', 'Not authorized', '"ipAddress"', '"pollingInterval"']) {
      expect(DYSON_AI_CONTEXT).toContain(fact);
    }
  });
});
