/** Energy math shared by the dashboard, planner and API. All powers are in watts. */

export interface EnergyConfig {
  /** Nominal battery capacity in Wh. */
  capacityWh: number;
  /** Fraction of the nominal capacity that is actually usable (BMS reserve, aging). */
  usableFactor: number;
  /** Inverter efficiency for the AC rail. */
  effAc: number;
  /** Converter efficiency for DC / USB rails. */
  effDc: number;
}

export const DEFAULT_ENERGY_CONFIG: EnergyConfig = {
  capacityWh: 1024,
  usableFactor: 0.9,
  effAc: 0.88,
  effDc: 0.95,
};

/**
 * Capacity presets by model code prefix. These are educated guesses (the app only maps
 * model → max charge power) — the user can always override the capacity in settings.
 */
export const MODEL_PRESETS: { prefix: string; label: string; capacityWh: number; maxChargeW: number }[] = [
  { prefix: 'MGI106', label: 'INFINITY 1000', capacityWh: 1024, maxChargeW: 1200 },
  { prefix: 'MGI032', label: 'INFINITY 300', capacityWh: 320, maxChargeW: 350 },
];

export function presetForModel(modelCode: string | null | undefined) {
  if (!modelCode) return undefined;
  return MODEL_PRESETS.find((p) => modelCode.toUpperCase().startsWith(p.prefix));
}

export type Rail = 'ac' | 'dc' | 'usb';

export interface RailLoads {
  acW: number;
  dcW: number;
  usbW: number;
}

const clampSoc = (soc: number) => Math.max(0, Math.min(100, soc));

export function railEfficiency(rail: Rail, cfg: EnergyConfig): number {
  return rail === 'ac' ? cfg.effAc : cfg.effDc;
}

/** Energy still available to loads (before conversion losses), in Wh. */
export function availableEnergyWh(soc: number, cfg: EnergyConfig): number {
  return (clampSoc(soc) / 100) * cfg.capacityWh * cfg.usableFactor;
}

/** Power actually drawn from the battery to serve the given rail loads. */
export function batteryDrawW(loads: RailLoads, cfg: EnergyConfig): number {
  return loads.acW / cfg.effAc + loads.dcW / cfg.effDc + loads.usbW / cfg.effDc;
}

/** Hours until empty at the current load, or `null` when nothing is drawn. */
export function runtimeHours(soc: number, loads: RailLoads, cfg: EnergyConfig): number | null {
  const draw = batteryDrawW(loads, cfg);
  if (!(draw > 0)) return null;
  return availableEnergyWh(soc, cfg) / draw;
}

/** Runtime if each rail were the only consumer. */
export function railRuntimes(soc: number, loads: RailLoads, cfg: EnergyConfig): Record<Rail, number | null> {
  return {
    ac: runtimeHours(soc, { acW: loads.acW, dcW: 0, usbW: 0 }, cfg),
    dc: runtimeHours(soc, { acW: 0, dcW: loads.dcW, usbW: 0 }, cfg),
    usb: runtimeHours(soc, { acW: 0, dcW: 0, usbW: loads.usbW }, cfg),
  };
}

/**
 * Hours until 100 % at the current net input, `null` when not charging
 * (formula: `(100 − SOC)/100 × capacity / max(netInput, 1)`).
 */
export function timeToFullHours(soc: number, inputW: number, outputW: number, cfg: EnergyConfig): number | null {
  const net = inputW - outputW;
  if (net <= 0 || soc >= 100) return soc >= 100 ? 0 : null;
  return (((100 - clampSoc(soc)) / 100) * cfg.capacityWh) / Math.max(net, 1);
}

export type FlowDirection = 'charging' | 'discharging' | 'idle';

export function netPower(inputW: number, outputW: number, idleThresholdW = 3): { netW: number; direction: FlowDirection } {
  const netW = inputW - outputW;
  const direction: FlowDirection =
    Math.abs(netW) < idleThresholdW && inputW < idleThresholdW && outputW < idleThresholdW
      ? 'idle'
      : netW > 0
        ? 'charging'
        : netW < 0
          ? 'discharging'
          : 'idle';
  return { netW, direction };
}

/** Split hours into whole hours / minutes for display. */
export function splitHours(hours: number): { days: number; hours: number; minutes: number } {
  const totalMin = Math.max(0, Math.round(hours * 60));
  const days = Math.floor(totalMin / 1440);
  return { days, hours: Math.floor((totalMin % 1440) / 60), minutes: totalMin % 60 };
}

// ------------------------------------------------------------------ integrator

/**
 * Integrates power samples into Wh with the trapezoidal rule. Gaps longer than `maxGapMs`
 * (tab asleep, link lost) are not bridged, so a dropout never invents energy.
 */
export class EnergyIntegrator {
  whIn = 0;
  whOut = 0;
  private last: { ts: number; inW: number; outW: number } | null = null;

  constructor(private readonly maxGapMs = 10_000) {}

  add(ts: number, inW: number, outW: number): void {
    const prev = this.last;
    this.last = { ts, inW, outW };
    if (!prev) return;
    const dt = ts - prev.ts;
    if (dt <= 0 || dt > this.maxGapMs) return;
    const h = dt / 3_600_000;
    this.whIn += ((prev.inW + inW) / 2) * h;
    this.whOut += ((prev.outW + outW) / 2) * h;
  }

  reset(): void {
    this.whIn = 0;
    this.whOut = 0;
    this.last = null;
  }
}

// ------------------------------------------------------------------ planner

export interface Appliance {
  id: string;
  name: string;
  watts: number;
  /** Percentage of time the appliance actually draws `watts` (fridge compressor ≈ 35 %). */
  dutyPct: number;
  rail: Rail;
  enabled: boolean;
  icon?: string;
}

export const APPLIANCE_PRESETS: Omit<Appliance, 'id' | 'enabled'>[] = [
  { name: 'Fridge', watts: 150, dutyPct: 35, rail: 'ac', icon: 'refrigerator' },
  { name: 'Laptop', watts: 65, dutyPct: 100, rail: 'ac', icon: 'laptop' },
  { name: 'Phone', watts: 10, dutyPct: 100, rail: 'usb', icon: 'smartphone' },
  { name: 'CPAP', watts: 40, dutyPct: 100, rail: 'dc', icon: 'wind' },
  { name: 'TV', watts: 100, dutyPct: 100, rail: 'ac', icon: 'tv' },
  { name: 'Wi-Fi router', watts: 12, dutyPct: 100, rail: 'dc', icon: 'router' },
  { name: 'Fan', watts: 50, dutyPct: 100, rail: 'ac', icon: 'fan' },
  { name: 'Mini cooler', watts: 60, dutyPct: 50, rail: 'dc', icon: 'snowflake' },
  { name: 'LED light', watts: 8, dutyPct: 100, rail: 'usb', icon: 'lightbulb' },
  { name: 'Electric kettle', watts: 1500, dutyPct: 5, rail: 'ac', icon: 'coffee' },
  { name: 'Projector', watts: 120, dutyPct: 100, rail: 'ac', icon: 'projector' },
  { name: 'Drone charger', watts: 90, dutyPct: 100, rail: 'ac', icon: 'plane' },
];

export interface LoadPlan {
  /** Average load at the outlets, duty cycle applied. */
  averageLoadW: number;
  /** Worst-case simultaneous load (all enabled appliances on). */
  peakLoadW: number;
  /** Average draw from the battery including conversion losses. */
  batteryDrawW: number;
  runtimeHours: number | null;
  perAppliance: { id: string; averageW: number; hoursAlone: number | null }[];
  exceedsRated: boolean;
}

export function planLoad(appliances: Appliance[], soc: number, cfg: EnergyConfig, ratedOutputW = 1000): LoadPlan {
  const active = appliances.filter((a) => a.enabled);
  const avg = (a: Appliance) => a.watts * (Math.max(0, Math.min(100, a.dutyPct)) / 100);
  const loads: RailLoads = { acW: 0, dcW: 0, usbW: 0 };
  for (const a of active) loads[`${a.rail}W` as keyof RailLoads] += avg(a);
  const draw = batteryDrawW(loads, cfg);
  return {
    averageLoadW: active.reduce((s, a) => s + avg(a), 0),
    peakLoadW: active.reduce((s, a) => s + a.watts, 0),
    batteryDrawW: draw,
    runtimeHours: draw > 0 ? availableEnergyWh(soc, cfg) / draw : null,
    perAppliance: appliances.map((a) => ({
      id: a.id,
      averageW: avg(a),
      hoursAlone: hoursOf(avg(a), a.rail, soc, cfg),
    })),
    exceedsRated: active.reduce((s, a) => s + a.watts, 0) > ratedOutputW,
  };
}

/** "How many hours of X can I run?" */
export function hoursOf(watts: number, rail: Rail, soc: number, cfg: EnergyConfig): number | null {
  if (!(watts > 0)) return null;
  return (availableEnergyWh(soc, cfg) * railEfficiency(rail, cfg)) / watts;
}

/** Reverse calculator: "I need N hours → maximum continuous load at the outlet". */
export function maxContinuousLoadW(hours: number, soc: number, cfg: EnergyConfig, rail: Rail = 'ac'): number {
  if (!(hours > 0)) return 0;
  return (availableEnergyWh(soc, cfg) * railEfficiency(rail, cfg)) / hours;
}

// ------------------------------------------------------------------ alerts

export type AlertKind = 'socLow' | 'socCritical' | 'tempHigh' | 'inputOverLimit';

export interface EnergyAlert {
  kind: AlertKind;
  level: 'warning' | 'critical';
  value: number;
  threshold: number;
}

export interface AlertThresholds {
  socLow: number;
  socCritical: number;
  tempHighC: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = { socLow: 20, socCritical: 10, tempHighC: 45 };

export function evaluateAlerts(
  s: { soc: number | null; tempC: number | null; inputW: number | null; chargeLimitW: number | null },
  t: AlertThresholds = DEFAULT_ALERT_THRESHOLDS,
): EnergyAlert[] {
  const out: EnergyAlert[] = [];
  if (s.soc !== null) {
    if (s.soc < t.socCritical) out.push({ kind: 'socCritical', level: 'critical', value: s.soc, threshold: t.socCritical });
    else if (s.soc < t.socLow) out.push({ kind: 'socLow', level: 'warning', value: s.soc, threshold: t.socLow });
  }
  if (s.tempC !== null && s.tempC > t.tempHighC) {
    out.push({ kind: 'tempHigh', level: 'critical', value: s.tempC, threshold: t.tempHighC });
  }
  if (s.inputW !== null && s.chargeLimitW && s.inputW > s.chargeLimitW * 1.05) {
    out.push({ kind: 'inputOverLimit', level: 'warning', value: s.inputW, threshold: s.chargeLimitW });
  }
  return out;
}
