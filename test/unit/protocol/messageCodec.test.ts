/**
 * MessageCodec Unit Tests
 */
import { MessageCodec } from '../../../src/protocol/messageCodec.js';
import type { DysonMessage } from '../../../src/protocol/messageCodec.js';
import type { DeviceState } from '../../../src/devices/types.js';

/** Mirrors how the device layer extracts the raw state from a message */
function rawStateOf(message: DysonMessage) {
  return MessageCodec.parseRawState(message['product-state'] ?? message.data ?? {});
}

describe('MessageCodec', () => {
  describe('parseRawState', () => {
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

      const state = rawStateOf(message);

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

      const state = rawStateOf(message);

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

      const state = rawStateOf(message);

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

      const state = rawStateOf(message);

      expect(state.oscillationAngleStart).toBe(45);
      expect(state.oscillationAngleEnd).toBe(270);
    });

    it('should ignore invalid oscillation angles', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          oson: 'ON',
          oscs: 'INVALID',
          osce: '',
        },
      };

      const state = rawStateOf(message);

      expect(state.oscillation).toBe(true);
      expect(state.oscillationAngleStart).toBeUndefined();
      expect(state.oscillationAngleEnd).toBeUndefined();
    });

    it('should decode temperature sensor', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          tact: '2950',
        },
      };

      const state = rawStateOf(message);

      expect(state.temperature).toBe(2950);
    });

    it('should handle temperature OFF', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          tact: 'OFF',
        },
      };

      const state = rawStateOf(message);

      expect(state.temperature).toBeUndefined();
    });

    it('should decode humidity sensor', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          hact: '0045',
        },
      };

      const state = rawStateOf(message);

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

      const state = rawStateOf(message);

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

      const state = rawStateOf(message);

      // filf is hours remaining: round(2500 / 4300 * 100) = 58%
      expect(state.hepaFilterLife).toBe(58);
      // cflr is already a percentage
      expect(state.carbonFilterLife).toBe(80);
    });

    it('should keep fltf filter percentage as a percentage', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          fltf: '0050', // 50%
        },
      };

      const state = rawStateOf(message);

      expect(state.hepaFilterLife).toBe(50);
    });

    it('should convert filf hours to a rounded percentage', () => {
      expect(MessageCodec.parseRawState({ filf: '4300' }).hepaFilterLife).toBe(100);
      expect(MessageCodec.parseRawState({ filf: '0' }).hepaFilterLife).toBe(0);
      // 1000 / 4300 * 100 = 23.26 -> 23
      expect(MessageCodec.parseRawState({ filf: '1000' }).hepaFilterLife).toBe(23);
      // 2172 / 4300 * 100 = 50.51 -> 51
      expect(MessageCodec.parseRawState({ filf: '2172' }).hepaFilterLife).toBe(51);
    });

    it('should clamp filf hours beyond the rated life to 100%', () => {
      expect(MessageCodec.parseRawState({ filf: '9999' }).hepaFilterLife).toBe(100);
      expect(MessageCodec.parseRawState({ filf: '-5' }).hepaFilterLife).toBe(0);
    });

    it('should clamp fltf and cflr percentages to 0-100', () => {
      const high = MessageCodec.parseRawState({ fltf: '0150', cflr: '0101' });
      expect(high.hepaFilterLife).toBe(100);
      expect(high.carbonFilterLife).toBe(100);

      const low = MessageCodec.parseRawState({ fltf: '-1', cflr: '-20' });
      expect(low.hepaFilterLife).toBe(0);
      expect(low.carbonFilterLife).toBe(0);
    });

    it('should ignore invalid filter telemetry instead of producing NaN', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          filf: 'INVALID',
          fltf: '----',
          cflr: '',
        },
      };

      const state = rawStateOf(message);

      expect(state.hepaFilterLife).toBeUndefined();
      expect(state.carbonFilterLife).toBeUndefined();
      expect(Number.isNaN(state.hepaFilterLife)).toBe(false);
      expect(Number.isNaN(state.carbonFilterLife)).toBe(false);
    });

    it('should decode heating mode', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          hmod: 'HEAT',
          hmax: '2950',
        },
      };

      const state = rawStateOf(message);

      expect(state.heatingEnabled).toBe(true);
      expect(state.targetTemperature).toBe(2950);
    });

    it('should ignore invalid target temperature', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          hmod: 'HEAT',
          hmax: 'OFF',
        },
      };

      const state = rawStateOf(message);

      expect(state.heatingEnabled).toBe(true);
      expect(state.targetTemperature).toBeUndefined();
    });

    it('should decode humidifier mode', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          hume: 'AUTO',
          humt: '0055',
        },
      };

      const state = rawStateOf(message);

      expect(state.humidifierEnabled).toBe(true);
      expect(state.humidifierAuto).toBe(true);
      expect(state.targetHumidity).toBe(55);
    });

    it('should set humidifierAuto false for manual humidifier ON', () => {
      const state = MessageCodec.parseRawState({ hume: 'ON' });
      expect(state.humidifierEnabled).toBe(true);
      expect(state.humidifierAuto).toBe(false);
    });

    it('should set humidifierEnabled and humidifierAuto false when humidifier OFF', () => {
      const state = MessageCodec.parseRawState({ hume: 'OFF' });
      expect(state.humidifierEnabled).toBe(false);
      expect(state.humidifierAuto).toBe(false);
    });

    it('should not set humidifierAuto when hume is absent', () => {
      const state = MessageCodec.parseRawState({ humt: '0050' });
      expect(state.humidifierAuto).toBeUndefined();
      expect(state.humidifierEnabled).toBeUndefined();
    });

    it('should ignore invalid target humidity', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          hume: 'AUTO',
          humt: '----',
        },
      };

      const state = rawStateOf(message);

      expect(state.humidifierEnabled).toBe(true);
      expect(state.targetHumidity).toBeUndefined();
    });

    it('should decode fan mode AUTO', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          fmod: 'AUTO',
        },
      };

      const state = rawStateOf(message);

      expect(state.autoMode).toBe(true);
    });

    it('should decode fan mode OFF', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          fmod: 'OFF',
        },
      };

      const state = rawStateOf(message);

      expect(state.isOn).toBe(false);
    });

    it('should decode front airflow', () => {
      const message: DysonMessage = {
        msg: 'CURRENT-STATE',
        'product-state': {
          ffoc: 'ON',
        },
      };

      const state = rawStateOf(message);

      expect(state.frontAirflow).toBe(true);
    });

    it('should return empty object for message without state data', () => {
      const message: DysonMessage = {
        msg: 'UNKNOWN',
      };
      const state = rawStateOf(message);
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

      const state = rawStateOf(message as DysonMessage);

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

      const state = rawStateOf(message as DysonMessage);

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

      const state = rawStateOf(message as DysonMessage);

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

      const state = rawStateOf(message as DysonMessage);

      expect(state.heatingEnabled).toBe(true);
      expect(state.targetTemperature).toBe(2950);
      expect(state.humidifierEnabled).toBe(true);
      expect(state.targetHumidity).toBe(60);
    });
  });

  describe('encodeFanSpeed', () => {
    it('should encode speed 1 as 0001', () => {
      expect(MessageCodec.encodeFanSpeed(1)).toBe('0001');
    });

    it('should encode speed 10 as 0010', () => {
      expect(MessageCodec.encodeFanSpeed(10)).toBe('0010');
    });

    it('should encode negative speed as AUTO', () => {
      expect(MessageCodec.encodeFanSpeed(-1)).toBe('AUTO');
    });

    it('should clamp speed below 1 to 1', () => {
      expect(MessageCodec.encodeFanSpeed(0)).toBe('0001');
    });

    it('should clamp speed above 10 to 10', () => {
      expect(MessageCodec.encodeFanSpeed(15)).toBe('0010');
    });
  });

  describe('decodeFanSpeed', () => {
    it('should decode 0005 to speed 5', () => {
      const result = MessageCodec.decodeFanSpeed('0005');
      expect(result.speed).toBe(5);
      expect(result.autoMode).toBe(false);
    });

    it('should decode AUTO', () => {
      const result = MessageCodec.decodeFanSpeed('AUTO');
      expect(result.speed).toBe(-1);
      expect(result.autoMode).toBe(true);
    });

    it('should handle invalid input', () => {
      const result = MessageCodec.decodeFanSpeed('invalid');
      expect(result.speed).toBe(0);
      expect(result.autoMode).toBe(false);
    });
  });

  describe('percentToSpeed', () => {
    it('should convert 0% to speed 1', () => {
      expect(MessageCodec.percentToSpeed(0)).toBe(1);
    });

    it('should convert 10% to speed 1', () => {
      expect(MessageCodec.percentToSpeed(10)).toBe(1);
    });

    it('should convert 11% to speed 2', () => {
      expect(MessageCodec.percentToSpeed(11)).toBe(2);
    });

    it('should convert 50% to speed 5', () => {
      expect(MessageCodec.percentToSpeed(50)).toBe(5);
    });

    it('should convert 100% to speed 10', () => {
      expect(MessageCodec.percentToSpeed(100)).toBe(10);
    });

    it('should handle negative values', () => {
      expect(MessageCodec.percentToSpeed(-10)).toBe(1);
    });
  });

  describe('speedToPercent', () => {
    it('should convert speed 1 to 10%', () => {
      expect(MessageCodec.speedToPercent(1)).toBe(10);
    });

    it('should convert speed 5 to 50%', () => {
      expect(MessageCodec.speedToPercent(5)).toBe(50);
    });

    it('should convert speed 10 to 100%', () => {
      expect(MessageCodec.speedToPercent(10)).toBe(100);
    });

    it('should convert AUTO (-1) to 0%', () => {
      // When fnsp is 'AUTO', we don't know the actual speed
      // so we show 0% to indicate the device is managing the speed
      expect(MessageCodec.speedToPercent(-1)).toBe(0);
    });

    it('should handle 0 speed', () => {
      expect(MessageCodec.speedToPercent(0)).toBe(0);
    });
  });

  describe('temperature conversion', () => {
    it('should encode 20°C correctly', () => {
      // 20°C = 293.15K * 10 = 2932 (rounded)
      expect(MessageCodec.encodeTemperature(20)).toBe('2932');
    });

    it('should encode 0°C correctly', () => {
      // 0°C = 273.15K * 10 = 2732 (rounded)
      expect(MessageCodec.encodeTemperature(0)).toBe('2732');
    });

    it('should decode temperature to Celsius', () => {
      // 2950 / 10 - 273.15 = 21.85°C
      expect(MessageCodec.decodeTemperature(2950)).toBeCloseTo(21.85, 2);
    });

    it('should decode string temperature', () => {
      expect(MessageCodec.decodeTemperature('2950')).toBeCloseTo(21.85, 2);
    });
  });

  describe('parseEnvironmentalData', () => {
    it('should parse advanced sensor readings', () => {
      const state: Partial<DeviceState> = {};
      MessageCodec.parseEnvironmentalData({ tact: '2950', hact: '0045', p25r: '0012', p10r: '0020', va10: '0030', noxl: '0010' }, state);
      expect(state).toMatchObject({ temperature: 2950, humidity: 45, pm25: 12, pm10: 20, vocIndex: 30, no2Index: 10 });
    });

    it('should use the basic pact/vact indices when no p25r/va10 is present', () => {
      const state: Partial<DeviceState> = {};
      MessageCodec.parseEnvironmentalData({ pact: '0004', vact: '0008' }, state);
      expect(state).toMatchObject({ pm25: 4, vocIndex: 8 });
    });

    it('should not let pact/vact overwrite p25r/va10 from the same message', () => {
      const state: Partial<DeviceState> = {};
      MessageCodec.parseEnvironmentalData({ p25r: '0035', pact: '0003', va10: '0050', vact: '0002' }, state);
      expect(state.pm25).toBe(35);
      expect(state.vocIndex).toBe(50);
    });

    it('should skip INIT and OFF readings', () => {
      const state: Partial<DeviceState> = {};
      MessageCodec.parseEnvironmentalData({ tact: 'OFF', p25r: 'INIT', va10: 'OFF' }, state);
      expect(state).toEqual({});
    });
  });

  describe('decodeCelsius', () => {
    it('should convert Kelvin x 10 to Celsius rounded to 0.1', () => {
      // 2950 / 10 - 273.15 = 21.85 -> 21.9 (floating point: 21.850000000000023)
      expect(MessageCodec.decodeCelsius(2950)).toBe(21.9);
      expect(MessageCodec.decodeCelsius(2932)).toBe(20.1);
      expect(MessageCodec.decodeCelsius(2730)).toBe(-0.1);
    });

    it('should return undefined for undefined', () => {
      expect(MessageCodec.decodeCelsius(undefined)).toBeUndefined();
    });

    it('should return undefined for NaN and non-finite values', () => {
      expect(MessageCodec.decodeCelsius(NaN)).toBeUndefined();
      expect(MessageCodec.decodeCelsius(Infinity)).toBeUndefined();
    });

    it('should return undefined for zero or negative readings', () => {
      expect(MessageCodec.decodeCelsius(0)).toBeUndefined();
      expect(MessageCodec.decodeCelsius(-10)).toBeUndefined();
    });
  });
});
