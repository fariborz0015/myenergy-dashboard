import { describe, expect, it } from 'vitest';
import { bytesToHex, decodeFrame, encodeBattery, FrameAssembler, hexToBytes, parseBattery } from '../src';

/** Frames captured from a real MGI032GR1HEU ("INFINITY 1000"), delivering ~70 W AC at 84 % SOC. */
const REAL = {
  battery: '574c0010530035546400000001ffffff2600000000000000000000000000000000000000010112000000000000000000000000000000000000010cf2d9d8',
  status: '574c00105000040000042afcac',
  system:
    '574c0010510049aa18000000000000000000450045000000000000000000000000ab1a0000000000000000000000000000000000000000000000000000ac0a0112013e01d201d20159ba05140000015ed8b4',
  unknown52: '574c001052002400000000000000000000000000000000000000010000000000000000000000000000000072fd',
  /** The same 51 frame as it once arrived: without its leading `574c`. */
  headerless51:
    '0010510049aa18000000000000000000450045000000000000000000000000ab1a0000000000000000000000000000000000000000000000000000ac0a0113013e01d201d20159ba05140000015e1924',
};

describe('frames from a real device', () => {
  it('response CRC is Modbus over all preceding bytes, low byte first', () => {
    for (const hex of [REAL.battery, REAL.status, REAL.system, REAL.unknown52]) {
      const f = decodeFrame(hex);
      expect('frame' in f && f.frame.crcOk).toBe(true);
    }
  });

  it('decodes the battery frame including the extra fields', () => {
    const f = decodeFrame(REAL.battery);
    if (f.type !== 'battery') throw new Error('expected battery');
    expect(f.data).toEqual({
      soc: 84,
      tempC: 27.4,
      temperaturesC: [27.4],
      sohPct: 100,
      currentA: -2.18,
      cellVoltagesV: [3.314],
    });
  });

  it('decodes status and system frames', () => {
    const s = decodeFrame(REAL.status);
    if (s.type !== 'status') throw new Error('expected status');
    expect(s.bitmap).toBe(0x42a);
    expect(s.data).toMatchObject({ acOutput: true, usbOutput: true, dcChargerConnected: true, wifi: true, dcOutput: false });

    const y = decodeFrame(REAL.system);
    if (y.type !== 'system') throw new Error('expected system');
    expect(y.data.power).toMatchObject({ inputW: 0, outputW: 69, acOutputW: 69 });
    expect(y.data.remainUsableTime).toBe(0);
    expect(y.data.internalTempsC).toEqual([27.4, 31.8, 46.6, 46.6, 34.5]);
    expect(y.data).toMatchObject({ lightWorkMode: 0, backlight: 0, chargingPowerSetting: 350 });
  });

  it('keeps the undocumented 52 frame as a generic binary frame', () => {
    expect(decodeFrame(REAL.unknown52)).toMatchObject({ type: 'binary', frame: { cmd: 0x52, declaredLength: 36 } });
  });

  it('repairs a frame that arrived without its 574c header (CRC-checked)', () => {
    const frames: string[] = [];
    new FrameAssembler((h) => frames.push(h)).push(hexToBytes(REAL.headerless51));
    expect(frames).toHaveLength(1);
    const f = decodeFrame(frames[0]!);
    expect(f.type).toBe('system');
    expect('frame' in f && f.frame.crcOk).toBe(true);
  });

  it('does not "repair" garbage that merely starts with 0010', () => {
    const frames: string[] = [];
    new FrameAssembler((h) => frames.push(h)).push(hexToBytes('0010510003aabbcc0000'));
    expect(decodeFrame(frames[0]!).type).toBe('unknown');
  });

  it('the simulator encodes the battery frame with the real layout', () => {
    const sim = bytesToHex(encodeBattery({ soc: 84, temperaturesC: [27.4], sohPct: 100, currentA: -2.18, cellVoltagesV: [3.314] }));
    expect(sim).toBe(REAL.battery);
    expect(parseBattery('54').cellVoltagesV).toEqual([]);
  });
});
