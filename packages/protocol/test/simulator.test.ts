import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asciiCommands,
  commands,
  decodeFrame,
  PowerStationSimulator,
  SimulatorTransport,
  type DecodedFrame,
} from '../src';

const decodeAll = (frames: Uint8Array[]): DecodedFrame[] => frames.map((f) => decodeFrame(f));

describe('PowerStationSimulator', () => {
  it('answers the connect queries', () => {
    const sim = new PowerStationSimulator({ seed: 1 });
    const [sn] = decodeAll(sim.handleWrite(asciiCommands.querySn()));
    expect(sn?.type === 'ascii' && sn.reply.kind === 'sn' && sn.reply.data.deviceSn).toBe(sim.info.deviceSn);
    const [ver] = decodeAll(sim.handleWrite(asciiCommands.queryVersion()));
    expect(ver?.type === 'ascii' && ver.reply.kind === 'ver' && ver.reply.data.softwareVersion).toBe('1.7.9');
    const [v] = decodeAll(sim.handleWrite(commands.queryVersions()));
    expect(v?.type === 'versions' && v.data.deviceSn).toBe(sim.info.deviceSn);
    const [m] = decodeAll(sim.handleWrite(commands.queryModelInfo()));
    expect(m?.type === 'model' && m.data).toEqual({ deptCode: '103', deviceModelCode: 'MGI106MG2HEU' });
  });

  it('applies switch commands and reports them in the next status frame', () => {
    const sim = new PowerStationSimulator({ seed: 1 });
    const replies = decodeAll(sim.handleWrite(commands.setSwitch('acOutput', false)));
    expect(replies[0]).toMatchObject({ type: 'ack', success: true });
    const status = decodeFrame(sim.statusFrame());
    expect(status.type === 'status' && status.data.acOutput).toBe(false);
    const sys = decodeFrame(sim.systemFrame());
    expect(sys.type === 'system' && sys.data.power?.acOutputW).toBe(0);
  });

  it('ignores frames with a bad CRC', () => {
    const sim = new PowerStationSimulator({ seed: 1 });
    const bad = commands.setSwitch('acOutput', false);
    bad[bad.length - 1] = bad[bad.length - 1]! ^ 0xff;
    expect(sim.handleWrite(bad)).toEqual([]);
    expect(sim.state.switches.acOutput).toBe(true);
  });

  it('applies timers, charge limit and display settings', () => {
    const sim = new PowerStationSimulator({ seed: 1 });
    sim.handleWrite(commands.setTimer('dcAutoOff', 90));
    sim.handleWrite(commands.setChargeLimit(400));
    sim.handleWrite(commands.setLightMode(40));
    sim.handleWrite(commands.setBacklight(80));
    const f = decodeFrame(sim.systemFrame());
    if (f.type !== 'system') throw new Error('expected system');
    expect(f.data.timersSet?.dcAutoOff).toBe(90);
    expect(f.data.timersRemaining?.dcAutoOff).toBe(90);
    expect(f.data.chargingPowerSetting).toBe(400);
    expect(f.data.lightWorkMode).toBe(40);
    expect(f.data.backlight).toBe(80);
    expect(f.data.power!.inputW).toBeLessThanOrEqual(400);
  });

  it('auto-off timer switches the rail off when it expires', () => {
    const sim = new PowerStationSimulator({ seed: 1 });
    sim.handleWrite(commands.setTimer('usbAutoOff', 1));
    for (let i = 0; i < 61; i++) sim.tick(1);
    expect(sim.state.switches.usbOutput).toBe(false);
  });

  it('SOC follows net power', () => {
    const sim = new PowerStationSimulator({ seed: 2, initialSoc: 50 });
    sim.setScenario({ solar: false, acCharger: false });
    for (let i = 0; i < 600; i++) sim.tick(1);
    expect(sim.state.socExact).toBeLessThan(50);
    const draining = sim.state.socExact;
    sim.setScenario({ acCharger: true });
    for (let i = 0; i < 600; i++) sim.tick(1);
    expect(sim.state.socExact).toBeGreaterThan(draining);
  });

  it('produces plausible readings', () => {
    const sim = new PowerStationSimulator({ seed: 3 });
    for (let i = 0; i < 300; i++) {
      sim.tick(1);
      const b = decodeFrame(sim.batteryFrame());
      const s = decodeFrame(sim.systemFrame());
      if (b.type !== 'battery' || s.type !== 'system') throw new Error('bad frames');
      expect(b.data.soc).toBeGreaterThanOrEqual(0);
      expect(b.data.soc).toBeLessThanOrEqual(100);
      expect(b.data.tempC!).toBeGreaterThan(15);
      expect(b.data.tempC!).toBeLessThan(45);
      const p = s.data.power!;
      expect(p.outputW).toBe(p.acOutputW + p.dcOutputW + p.carW + p.wirelessW + p.usbAW + p.usbCW);
      expect(p.inputW).toBe(p.acInputW + p.dcInputW);
    }
  });
});

describe('SimulatorTransport', () => {
  afterEach(() => vi.useRealTimers());

  it('streams frames and answers writes like a device', async () => {
    vi.useFakeTimers();
    const t = new SimulatorTransport({ seed: 1, latencyMs: 10 });
    const got: DecodedFrame[] = [];
    t.onNotify((b) => got.push(decodeFrame(b)));
    const p = t.connect();
    await vi.advanceTimersByTimeAsync(400);
    await p;
    await t.write(commands.queryModelInfo());
    await vi.advanceTimersByTimeAsync(2100);
    const types = new Set(got.map((f) => f.type));
    expect(types).toContain('model');
    expect(types).toContain('system');
    expect(types).toContain('battery');
    expect(types).toContain('status');
    await t.disconnect();
    await expect(t.write(commands.queryModelInfo())).rejects.toThrow();
  });
});
