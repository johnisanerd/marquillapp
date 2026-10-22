import { ConfigService } from '@nestjs/config';
import { readIntEnv } from './env';

describe('readIntEnv', () => {
  it('should return the default when the key is unset or blank', () => {
    expect(readIntEnv({}, 'K', { default: 7 })).toBe(7);
    expect(readIntEnv({ K: '' }, 'K', { default: 7 })).toBe(7);
    expect(readIntEnv({ K: '  ' }, 'K', { default: 7 })).toBe(7);
  });

  it('should parse a base-10 integer, including 0 and surrounding space', () => {
    expect(readIntEnv({ K: '25' }, 'K', { default: 7 })).toBe(25);
    expect(readIntEnv({ K: ' 3 ' }, 'K', { default: 7 })).toBe(3);
    expect(readIntEnv({ K: '0' }, 'K', { default: 7 })).toBe(0);
  });

  it('should read from a ConfigService', () => {
    const config = new ConfigService({ K: '12' });
    expect(readIntEnv(config, 'K', { default: 7 })).toBe(12);
    expect(readIntEnv(config, 'MISSING', { default: 7 })).toBe(7);
  });

  it.each(['abc', '1.5', '-1', '1e3', '0x10', '10px', 'NaN'])(
    'should reject %s, naming the key and the value',
    (value) => {
      expect(() => readIntEnv({ K: value }, 'K', { default: 7 })).toThrow(
        new RegExp(`K.*${value}`),
      );
    },
  );

  it('should enforce min and max', () => {
    expect(() => readIntEnv({ K: '0' }, 'K', { default: 7, min: 1 })).toThrow(
      /K.*"0".*>= 1/,
    );
    expect(() => readIntEnv({ K: '11' }, 'K', { default: 7, max: 10 })).toThrow(
      /K.*"11".*<= 10/,
    );
    expect(readIntEnv({ K: '10' }, 'K', { default: 7, max: 10 })).toBe(10);
  });

  it('should allow negatives only when min permits', () => {
    expect(readIntEnv({ K: '-1' }, 'K', { default: 0, min: -5 })).toBe(-1);
  });
});
