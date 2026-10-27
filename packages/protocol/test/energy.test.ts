import { describe, expect, it } from 'vitest';
import {
  availableEnergyWh,
  DEFAULT_ENERGY_CONFIG,
  EnergyIntegrator,
  evaluateAlerts,
  hoursOf,
  maxContinuousLoadW,
  netPower,
  planLoad,
  presetForModel,
  railRuntimes,
  runtimeHours,
  splitHours,
  timeToFullHours,
  type Appliance,
} from '../src';

/** Fixed config so the expected numbers below stay hand-checkable (10 % BMS reserve). */
const cfg = { ...DEFAULT_ENERGY_CONFIG, capacityWh: 1024, usableFactor: 0.9 };

describe('runtime', () => {
  it('uses SOC, usable factor and per-rail efficiency', () => {
    // 50 % of 1024 Wh × 0.9 = 460.8 Wh; draw = 88/0.88 + 19/0.95 = 100 + 20 = 120 W
    expect(availableEnergyWh(50, cfg)).toBeCloseTo(460.8);
    expect(runtimeHours(50, { acW: 88, dcW: 19, usbW: 0 }, cfg)).toBeCloseTo(3.84);
  });

  it('returns null with no load', () => {
    expect(runtimeHours(80, { acW: 0, dcW: 0, usbW: 0 }, cfg)).toBeNull();
  });

  it('computes each rail individually', () => {
    const r = railRuntimes(100, { acW: 88, dcW: 0, usbW: 9.5 }, cfg);
    expect(r.ac).toBeCloseTo(921.6 / 100);
    expect(r.dc).toBeNull();
    expect(r.usb).toBeCloseTo(921.6 / 10);
  });
});

describe('time to full', () => {
  it('uses net input', () => {
    // 40 % missing of 1024 Wh = 409.6 Wh at 400 − 100 = 300 W
    expect(timeToFullHours(60, 400, 100, cfg)).toBeCloseTo(1.3653, 3);
  });
  it('is null when not charging and 0 when full', () => {
    expect(timeToFullHours(60, 100, 200, cfg)).toBeNull();
    expect(timeToFullHours(100, 100, 0, cfg)).toBe(0);
  });
});

describe('net power', () => {
  it('classifies direction', () => {
    expect(netPower(300, 100)).toEqual({ netW: 200, direction: 'charging' });
    expect(netPower(0, 150)).toEqual({ netW: -150, direction: 'discharging' });
    expect(netPower(1, 0).direction).toBe('idle');
  });
});

describe('EnergyIntegrator', () => {
  it('integrates with the trapezoidal rule', () => {
    const i = new EnergyIntegrator();
    for (let s = 0; s <= 3600; s++) i.add(s * 1000, 100, 50);
    expect(i.whIn).toBeCloseTo(100, 6);
    expect(i.whOut).toBeCloseTo(50, 6);
  });
  it('does not bridge long gaps', () => {
    const i = new EnergyIntegrator(10_000);
    i.add(0, 100, 0);
    i.add(60_000, 100, 0);
    expect(i.whIn).toBe(0);
    i.add(61_000, 100, 0);
    expect(i.whIn).toBeCloseTo(100 / 3600);
  });
});

describe('planner', () => {
  const list: Appliance[] = [
    { id: 'f', name: 'Fridge', watts: 150, dutyPct: 40, rail: 'ac', enabled: true },
    { id: 'r', name: 'Router', watts: 19, dutyPct: 100, rail: 'dc', enabled: true },
    { id: 'k', name: 'Kettle', watts: 1500, dutyPct: 5, rail: 'ac', enabled: false },
  ];

  it('applies duty cycles and efficiencies', () => {
    const p = planLoad(list, 100, cfg);
    expect(p.averageLoadW).toBeCloseTo(79);
    expect(p.peakLoadW).toBe(169);
    expect(p.batteryDrawW).toBeCloseTo(60 / 0.88 + 19 / 0.95);
    expect(p.runtimeHours).toBeCloseTo(921.6 / p.batteryDrawW);
    expect(p.exceedsRated).toBe(false);
    expect(p.perAppliance.find((a) => a.id === 'k')?.hoursAlone).toBeCloseTo((921.6 * 0.88) / 75);
  });

  it('flags peak loads above the rated output', () => {
    expect(planLoad(list.map((a) => ({ ...a, enabled: true })), 100, cfg).exceedsRated).toBe(true);
  });

  it('answers "how many hours of X" and the reverse question', () => {
    expect(hoursOf(100, 'ac', 100, cfg)).toBeCloseTo(8.11, 2);
    expect(maxContinuousLoadW(8.11, 100, cfg)).toBeCloseTo(100, 0);
    expect(hoursOf(0, 'ac', 100, cfg)).toBeNull();
    expect(maxContinuousLoadW(0, 100, cfg)).toBe(0);
  });
});

describe('alerts', () => {
  it('raises low / critical / temperature / input alerts', () => {
    const kinds = (s: Parameters<typeof evaluateAlerts>[0]) => evaluateAlerts(s).map((a) => a.kind);
    expect(kinds({ soc: 50, tempC: 30, inputW: 100, chargeLimitW: 800 })).toEqual([]);
    expect(kinds({ soc: 15, tempC: null, inputW: null, chargeLimitW: null })).toEqual(['socLow']);
    expect(kinds({ soc: 5, tempC: 50, inputW: 900, chargeLimitW: 800 })).toEqual([
      'socCritical',
      'tempHigh',
      'inputOverLimit',
    ]);
  });
});

describe('defaults', () => {
  it('do not apply a reserve on top of the BMS SOC', () => {
    expect(DEFAULT_ENERGY_CONFIG.usableFactor).toBe(1);
    // 84 % of 1024 Wh at 69 W AC → ~11 h (measured ~10 Wh/% at the outlet on a real unit)
    expect(runtimeHours(84, { acW: 69, dcW: 0, usbW: 0 }, DEFAULT_ENERGY_CONFIG)).toBeCloseTo(10.97, 1);
  });
});

describe('misc', () => {
  it('splits hours', () => {
    expect(splitHours(27.5)).toEqual({ days: 1, hours: 3, minutes: 30 });
  });
  it('finds model presets', () => {
    expect(presetForModel('MGI106MG2HEU')?.capacityWh).toBe(1024);
    expect(presetForModel('MGI032GR1HEU')).toMatchObject({ capacityWh: 1024, maxChargeW: 350 });
    expect(presetForModel('unknown')).toBeUndefined();
  });
});
