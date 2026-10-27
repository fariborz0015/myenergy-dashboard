import { describe, expect, it } from 'vitest';
import { makeFormatter } from './format-core';
import { normalizeServiceUuid } from './uuid';

const units = { h: 'h', m: 'm', d: 'd', w: 'W', kw: 'kW', wh: 'Wh', kwh: 'kWh' };

describe('makeFormatter', () => {
  const en = makeFormatter('en', true, 'c', units);
  const fa = makeFormatter('fa', true, 'c', { ...units, h: 'س', m: 'د', d: 'ر' });
  const faLatin = makeFormatter('fa', false, 'c', units);

  it('formats durations compactly', () => {
    expect(en.duration(3.2)).toBe('3h 12m');
    expect(en.duration(0.25)).toBe('15m');
    expect(en.duration(50)).toBe('2d 2h');
    expect(en.duration(null)).toBe('—');
    expect(en.duration(5000)).toBe('99+d');
  });

  it('formats power and energy with sensible units', () => {
    expect(en.watts(1234)).toBe('1,234 W');
    expect(en.watts(12500)).toBe('12.5 kW');
    expect(en.energy(2820)).toBe('2.82 kWh');
    expect(en.energy(4.5)).toBe('4.5 Wh');
  });

  it('uses Persian digits and percent sign when asked', () => {
    expect(fa.pct(76)).toBe('۷۶٪');
    expect(fa.duration(2.5)).toBe('۲س ۳۰د');
    expect(faLatin.pct(76)).toBe('76٪');
  });

  it('converts temperatures', () => {
    expect(en.temp(25)).toBe('25.0°C');
    expect(makeFormatter('en', false, 'f', units).temp(25)).toBe('77.0°F');
  });
});

describe('normalizeServiceUuid', () => {
  it('accepts 16-bit, 32-bit and 128-bit forms', () => {
    expect(normalizeServiceUuid('fff0')).toBe(0xfff0);
    expect(normalizeServiceUuid('0xFFE0')).toBe(0xffe0);
    expect(normalizeServiceUuid('0000fff0')).toBe('0000fff0-0000-1000-8000-00805f9b34fb');
    expect(normalizeServiceUuid('6E400001-B5A3-F393-E0A9-E50E24DCCA9E')).toBe('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
  });
  it('rejects garbage', () => {
    expect(normalizeServiceUuid('')).toBeNull();
    expect(normalizeServiceUuid('hello')).toBeNull();
  });
});
