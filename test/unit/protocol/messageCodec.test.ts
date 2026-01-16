/**
 * MessageCodec Unit Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import { MessageCodec, messageCodec } from '../../../src/protocol/messageCodec.js';
import type { DysonMessage } from '../../../src/protocol/messageCodec.js';

describe('MessageCodec', () => {
  let codec: MessageCodec;

  beforeEach(() => {
    codec = new MessageCodec();
  });

  describe('encodeCommand', () => {
    it('should encode fan power command', () => {
      const result = JSON.parse(codec.encodeCommand({ fanPower: true }));

      expect(result.msg).toBe('STATE-SET');
      expect(result['mode-reason']).toBe('LAPP');
      expect(result.data.fpwr).toBe('ON');
      expect(result.time).toBeDefined();
    });

    it('should encode fan power off', () => {
      const result = JSON.parse(codec.encodeCommand({ fanPower: false }));
      expect(result.data.fpwr).toBe('OFF');
    });

    it('should encode fan speed', () => {
      const result = JSON.parse(codec.encodeCommand({ fanSpeed: 5 }));
      expect(result.data.fnsp).toBe('0005');
    });

    it('should encode fan speed 10', () => {
      const result = JSON.parse(codec.encodeCommand({ fanSpeed: 10 }));
      expect(result.data.fnsp).toBe('0010');
    });

    it('should encode auto fan speed', () => {
      const result = JSON.parse(codec.encodeCommand({ fanSpeed: -1 }));
      expect(result.data.fnsp).toBe('AUTO');
    });

    it('should encode fan mode', () => {
      const result = JSON.parse(codec.encodeCommand({ fanMode: 'AUTO' }));
      expect(result.data.fmod).toBe('AUTO');
    });

    it('should encode oscillation on', () => {
      const result = JSON.parse(codec.encodeCommand({ oscillation: true }));
      expect(result.data.oson).toBe('ON');
    });

    it('should encode oscillation off', () => {
      const result = JSON.parse(codec.encodeCommand({ oscillation: false }));
      expect(result.data.oson).toBe('OFF');
    });

    it('should encode oscillation angles', () => {
      const result = JSON.parse(codec.encodeCommand({
        oscillationAngleStart: 45,
        oscillationAngleEnd: 180,
      }));
      expect(result.data.oscs).toBe('0045');
      expect(result.data.osce).toBe('0180');
    });

    it('should encode night mode', () => {
      const result = JSON.parse(codec.encodeCommand({ nightMode: true }));
      expect(result.data.nmod).toBe('ON');
    });

    it('should encode continuous monitoring', () => {
      const result = JSON.parse(codec.encodeCommand({ continuousMonitoring: true }));
      expect(result.data.rhtm).toBe('ON');
    });

    it('should encode front airflow', () => {
      const result = JSON.parse(codec.encodeCommand({ frontAirflow: true }));
      expect(result.data.ffoc).toBe('ON');
    });

    it('should encode heating mode', () => {
      const result = JSON.parse(codec.encodeCommand({ heatingMode: true }));
      expect(result.data.hmod).toBe('HEAT');
    });

    it('should encode target temperature', () => {
      const result = JSON.parse(codec.encodeCommand({ targetTemperature: 22 }));
      // 22°C = 295.15K * 10 = 2952 (rounded)
      expect(result.data.hmax).toBe('2952');
    });

    it('should encode humidifier mode', () => {
      const result = JSON.parse(codec.encodeCommand({ humidifierMode: true }));
      expect(result.data.hume).toBe('ON');
    });

    it('should encode target humidity', () => {
      const result = JSON.parse(codec.encodeCommand({ targetHumidity: 50 }));
      expect(result.data.humt).toBe('0050');
    });

    it('should encode multiple commands at once', () => {
      const result = JSON.parse(codec.encodeCommand({
        fanPower: true,
        fanSpeed: 7,
        oscillation: true,
        nightMode: false,
      }));
      expect(result.data.fpwr).toBe('ON');
      expect(result.data.fnsp).toBe('0007');
      expect(result.data.oson).toBe('ON');
      expect(result.data.nmod).toBe('OFF');
    });
  });

  describe('decodeState', () => {
    it('should decode CURRENT-STATE message from Buffer', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          fpwr: 'ON',
          fnsp: '0005',
          fmod: 'FAN', // Manual mode
          oson: 'ON',
          nmod: 'OFF',
        },
      };

      const state = codec.decodeState(Buffer.from(JSON.stringify(message)));

      expect(state.isOn).toBe(true);
      expect(state.fanSpeed).toBe(5);
      expect(state.autoMode).toBe(false);
      expect(state.oscillation).toBe(true);
      expect(state.nightMode).toBe(false);
    });

    it('should decode STATE-CHANGE message from object', () => {
      const message: DysonMessage = {
        msg: 'STATE-CHANGE',
        'product-state': {
          fnsp: 'AUTO',
          fmod: 'AUTO', // Auto mode is determined by fmod, not fnsp
        },
      };

      const state = codec.decodeState(message);

      expect(state.isOn).toBe(true); // fmod: 'AUTO' sets isOn: true
      expect(state.fanSpeed).toBe(-1);
      expect(state.autoMode).toBe(true);
    });

    it('should decode state from data field', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        data: {
          fpwr: 'ON',
          fnsp: '0003',
        },
      };

      const state = codec.decodeState(message);

      expect(state.isOn).toBe(true);
      expect(state.fanSpeed).toBe(3);
    });

    it('should decode oscillation angles', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          oscs: '0045',
          osce: '0270',
        },
      };

      const state = codec.decodeState(message);

      expect(state.oscillationAngleStart).toBe(45);
      expect(state.oscillationAngleEnd).toBe(270);
    });

    it('should decode temperature sensor', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          tact: '2950',
        },
      };

      const state = codec.decodeState(message);

      expect(state.temperature).toBe(2950);
    });

    it('should handle temperature OFF', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          tact: 'OFF',
        },
      };

      const state = codec.decodeState(message);

      expect(state.temperature).toBeUndefined();
    });

    it('should decode humidity sensor', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          hact: '0045',
        },
      };

      const state = codec.decodeState(message);

      expect(state.humidity).toBe(45);
    });

    it('should decode air quality sensors', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          p25r: '0012',
          p10r: '0008',
          va10: '0003',
          noxl: '0002',
        },
      };

      const state = codec.decodeState(message);

      expect(state.pm25).toBe(12);
      expect(state.pm10).toBe(8);
      expect(state.vocIndex).toBe(3);
      expect(state.no2Index).toBe(2);
    });

    it('should decode filter status', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          filf: '2500',
          cflr: '0080',
        },
      };

      const state = codec.decodeState(message);

      expect(state.hepaFilterLife).toBe(2500);
      expect(state.carbonFilterLife).toBe(3440); // 80% of 4300
    });

    it('should decode filter percentage to hours', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          fltf: '0050', // 50%
        },
      };

      const state = codec.decodeState(message);

      expect(state.hepaFilterLife).toBe(2150); // 50% of 4300
    });

    it('should decode heating mode', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          hmod: 'HEAT',
          hmax: '2950',
        },
      };

      const state = codec.decodeState(message);

      expect(state.heatingEnabled).toBe(true);
      expect(state.targetTemperature).toBe(2950);
    });

    it('should decode humidifier mode', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          hume: 'AUTO',
          humt: '0055',
        },
      };

      const state = codec.decodeState(message);

      expect(state.humidifierEnabled).toBe(true);
      expect(state.targetHumidity).toBe(55);
    });

    it('should decode fan mode AUTO', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          fmod: 'AUTO',
        },
      };

      const state = codec.decodeState(message);

      expect(state.autoMode).toBe(true);
    });

    it('should decode fan mode OFF', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          fmod: 'OFF',
        },
      };

      const state = codec.decodeState(message);

      expect(state.isOn).toBe(false);
    });

    it('should decode front airflow', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          ffoc: 'ON',
        },
      };

      const state = codec.decodeState(message);

      expect(state.frontAirflow).toBe(true);
    });

    it('should return empty object for invalid buffer', () => {
      const state = codec.decodeState(Buffer.from('not valid json'));
      expect(state).toEqual({});
    });

    it('should return empty object for message without state data', () => {
      const message: DysonMessage = {
        msg: 'UNKNOWN',
      };
      const state = codec.decodeState(message);
      expect(state).toEqual({});
    });

    it('should decode STATE-CHANGE with array format [old, new]', () => {
      // When iOS Dyson app changes settings, device broadcasts arrays
      const message = {
        msg: 'STATE-CHANGE',
        'product-state': {
          fpwr: ['OFF', 'ON'],
          fnsp: ['0003', '0007'],
          oson: ['OFF', 'ON'],
        },
      };

      const state = codec.decodeState(message as DysonMessage);

      expect(state.isOn).toBe(true);
      expect(state.fanSpeed).toBe(7);
      expect(state.oscillation).toBe(true);
    });

    it('should decode STATE-CHANGE with all array format fields', () => {
      const message = {
        msg: 'STATE-CHANGE',
        'product-state': {
          fmod: ['FAN', 'AUTO'],
          nmod: ['OFF', 'ON'],
          rhtm: ['OFF', 'ON'],
          ffoc: ['OFF', 'ON'],
        },
      };

      const state = codec.decodeState(message as DysonMessage);

      expect(state.autoMode).toBe(true);
      expect(state.nightMode).toBe(true);
      expect(state.continuousMonitoring).toBe(true);
      expect(state.frontAirflow).toBe(true);
    });

    it('should decode STATE-CHANGE arrays for sensor data', () => {
      const message = {
        msg: 'STATE-CHANGE',
        'product-state': {
          tact: ['2900', '2950'],
          hact: ['40', '55'],
        },
      };

      const state = codec.decodeState(message as DysonMessage);

      expect(state.temperature).toBe(2950);
      expect(state.humidity).toBe(55);
    });

    it('should decode STATE-CHANGE arrays for heating/humidifier', () => {
      const message = {
        msg: 'STATE-CHANGE',
        'product-state': {
          hmod: ['OFF', 'HEAT'],
          hmax: ['2900', '2950'],
          hume: ['OFF', 'ON'],
          humt: ['0040', '0060'],
        },
      };

      const state = codec.decodeState(message as DysonMessage);

      expect(state.heatingEnabled).toBe(true);
      expect(state.targetTemperature).toBe(2950);
      expect(state.humidifierEnabled).toBe(true);
      expect(state.targetHumidity).toBe(60);
    });
  });

  describe('encodeFanSpeed', () => {
    it('should encode speed 1 as 0001', () => {
      expect(codec.encodeFanSpeed(1)).toBe('0001');
    });

    it('should encode speed 10 as 0010', () => {
      expect(codec.encodeFanSpeed(10)).toBe('0010');
    });

    it('should encode negative speed as AUTO', () => {
      expect(codec.encodeFanSpeed(-1)).toBe('AUTO');
    });

    it('should clamp speed below 1 to 1', () => {
      expect(codec.encodeFanSpeed(0)).toBe('0001');
    });

    it('should clamp speed above 10 to 10', () => {
      expect(codec.encodeFanSpeed(15)).toBe('0010');
    });
  });

  describe('decodeFanSpeed', () => {
    it('should decode 0005 to speed 5', () => {
      const result = codec.decodeFanSpeed('0005');
      expect(result.speed).toBe(5);
      expect(result.autoMode).toBe(false);
    });

    it('should decode AUTO', () => {
      const result = codec.decodeFanSpeed('AUTO');
      expect(result.speed).toBe(-1);
      expect(result.autoMode).toBe(true);
    });

    it('should handle invalid input', () => {
      const result = codec.decodeFanSpeed('invalid');
      expect(result.speed).toBe(0);
      expect(result.autoMode).toBe(false);
    });
  });

  describe('percentToSpeed', () => {
    it('should convert 0% to speed 1', () => {
      expect(codec.percentToSpeed(0)).toBe(1);
    });

    it('should convert 10% to speed 1', () => {
      expect(codec.percentToSpeed(10)).toBe(1);
    });

    it('should convert 11% to speed 2', () => {
      expect(codec.percentToSpeed(11)).toBe(2);
    });

    it('should convert 50% to speed 5', () => {
      expect(codec.percentToSpeed(50)).toBe(5);
    });

    it('should convert 100% to speed 10', () => {
      expect(codec.percentToSpeed(100)).toBe(10);
    });

    it('should handle negative values', () => {
      expect(codec.percentToSpeed(-10)).toBe(1);
    });
  });

  describe('speedToPercent', () => {
    it('should convert speed 1 to 10%', () => {
      expect(codec.speedToPercent(1)).toBe(10);
    });

    it('should convert speed 5 to 50%', () => {
      expect(codec.speedToPercent(5)).toBe(50);
    });

    it('should convert speed 10 to 100%', () => {
      expect(codec.speedToPercent(10)).toBe(100);
    });

    it('should convert AUTO (-1) to 0%', () => {
      // When fnsp is 'AUTO', we don't know the actual speed
      // so we show 0% to indicate the device is managing the speed
      expect(codec.speedToPercent(-1)).toBe(0);
    });

    it('should handle 0 speed', () => {
      expect(codec.speedToPercent(0)).toBe(0);
    });
  });

  describe('encodeAngle', () => {
    it('should encode angle with padding', () => {
      expect(codec.encodeAngle(45)).toBe('0045');
      expect(codec.encodeAngle(180)).toBe('0180');
      expect(codec.encodeAngle(355)).toBe('0355');
    });

    it('should clamp angle below 45', () => {
      expect(codec.encodeAngle(30)).toBe('0045');
    });

    it('should clamp angle above 355', () => {
      expect(codec.encodeAngle(400)).toBe('0355');
    });
  });

  describe('temperature conversion', () => {
    it('should encode 20°C correctly', () => {
      // 20°C = 293.15K * 10 = 2932 (rounded)
      expect(codec.encodeTemperature(20)).toBe('2932');
    });

    it('should encode 0°C correctly', () => {
      // 0°C = 273.15K * 10 = 2732 (rounded)
      expect(codec.encodeTemperature(0)).toBe('2732');
    });

    it('should decode temperature to Celsius', () => {
      // 2950 / 10 - 273.15 = 21.85°C
      expect(codec.decodeTemperature(2950)).toBeCloseTo(21.85, 2);
    });

    it('should decode string temperature', () => {
      expect(codec.decodeTemperature('2950')).toBeCloseTo(21.85, 2);
    });
  });

  describe('encodeRequestState', () => {
    it('should create valid request message', () => {
      const result = JSON.parse(codec.encodeRequestState());

      expect(result.msg).toBe('REQUEST-CURRENT-STATE');
      expect(result.time).toBeDefined();
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(messageCodec).toBeInstanceOf(MessageCodec);
    });

    it('should work correctly', () => {
      const result = JSON.parse(messageCodec.encodeCommand({ fanPower: true }));
      expect(result.data.fpwr).toBe('ON');
    });
  });
});
