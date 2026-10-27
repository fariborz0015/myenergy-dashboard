import { describe, expect, it } from 'vitest';
import {
  asciiCommands,
  buildRequest,
  buildResponse,
  bytesToHex,
  commands,
  connectSequence,
  crc16Modbus,
  decodeFrame,
  encodeAck,
  encodeBattery,
  encodeModelInfo,
  encodeStatus,
  encodeSystem,
  encodeVersions,
  FrameAssembler,
  hexToAscii,
  hexToBytes,
  parseSystem,
  parseTlv,
  summarizeFrame,
  toDottedDecimal,
  wifiProvisionSequence,
  type SwitchStates,
} from '../src';

const hex = (b: Uint8Array) => bytesToHex(b).toUpperCase();

describe('CRC-16/Modbus', () => {
  // Vectors from the task: frame shown + expected CRC bytes (low byte first).
  const vectors: [string, string][] = [
    ['4D4D00100C0000', '4D1A'],
    ['4D4D00100A0000', 'AD1B'],
    ['4D4D0010600002A001', '3C92'],
    ['4D4D0010600002A000', 'FD52'],
    ['4D4D0010610003A0003C', '93BD'],
    ['4D4D0010620003A201F4', '3248'],
    ['4D4D0010630002A105', '78C1'],
  ];

  it.each(vectors)('%s → %s', (body, crc) => {
    const value = crc16Modbus(hexToBytes(body));
    const lowFirst = ((value & 0xff) << 8) | (value >> 8);
    expect(lowFirst.toString(16).toUpperCase().padStart(4, '0')).toBe(crc);
  });

  it('matches the standard check value for "123456789"', () => {
    expect(crc16Modbus(new TextEncoder().encode('123456789'))).toBe(0x4b37);
  });
});

describe('request builders', () => {
  it('builds the query commands', () => {
    expect(hex(commands.queryVersions())).toBe('4D4D00100C00004D1A');
    expect(hex(commands.queryModelInfo())).toBe('4D4D00100A0000AD1B');
  });

  it('builds switch commands', () => {
    expect(hex(commands.setSwitch('acOutput', true))).toBe('4D4D0010600002A0013C92');
    expect(hex(commands.setSwitch('acOutput', false))).toBe('4D4D0010600002A000FD52');
    expect(hex(commands.setSwitch('wifi', true))).toMatch(/^4D4D0010600002A601/);
  });

  it('builds timer, charge limit and display commands', () => {
    expect(hex(commands.setTimer('autoShutdown', 60))).toBe('4D4D0010610003A0003C93BD');
    expect(hex(commands.setChargeLimit(500))).toBe('4D4D0010620003A201F43248');
    expect(hex(commands.setBacklight(5))).toBe('4D4D0010630002A10578C1');
    expect(hex(commands.setLightMode(40))).toMatch(/^4D4D0010630002A028/);
  });

  it('length field is big-endian payload length', () => {
    const f = buildRequest(0x77, new Uint8Array(300));
    expect(f[5]).toBe(0x01);
    expect(f[6]).toBe(0x2c);
    expect(f.length).toBe(7 + 300 + 2);
  });

  it('builds ASCII commands byte-exactly', () => {
    expect(new TextDecoder().decode(asciiCommands.querySn())).toBe('YICHU|SN|?\r\n');
    expect(new TextDecoder().decode(asciiCommands.queryVersion())).toBe('YICHU|VER?');
    expect(new TextDecoder().decode(asciiCommands.setWifi('Home Ü', 'p|w'))).toBe(
      'YICHU|WIFI|Home Ü|p|w\r\n',
    );
    // UTF-8, not Latin-1
    expect(bytesToHex(asciiCommands.setWifi('Ü', ''))).toContain('c39c');
  });

  it('connect sequence matches the app timing', () => {
    expect(connectSequence().map((s) => s.at)).toEqual([100, 300, 500, 700]);
    expect(wifiProvisionSequence('a', 'b').map((s) => s.at)).toEqual([0, 500, 1500, 1800]);
  });
});

describe('helpers', () => {
  it('hexToAscii stops at NUL', () => {
    expect(hexToAscii('41424300444546')).toBe('ABC');
  });
  it('toDottedDecimal', () => {
    expect(toDottedDecimal('01020a')).toBe('1.2.10');
    expect(toDottedDecimal('')).toBe('');
  });
  it('parseTlv', () => {
    expect(parseTlv('ab0201020c01ff')).toEqual({ ab: '0102', '0c': 'ff' });
    // truncated value is ignored
    expect(parseTlv('ab05010203')).toEqual({});
  });
});

describe('ASCII replies', () => {
  const ascii = (s: string) => bytesToHex(new TextEncoder().encode(s));

  it('parses SN with all fields', () => {
    const f = decodeFrame(ascii('YICHU|SN|GW123|SN456|103|MGI106MG2HEU\r\n'));
    expect(f.type).toBe('ascii');
    if (f.type !== 'ascii' || f.reply.kind !== 'sn') throw new Error('expected sn');
    expect(f.reply.data).toEqual({
      gatewaySn: 'GW123',
      deviceSn: 'SN456',
      deptCode: '103',
      deviceModelCode: 'MGI106MG2HEU',
    });
  });

  it('parses SN with only the gateway', () => {
    const f = decodeFrame(ascii('YICHU|SN|GW123?\r\n'));
    if (f.type !== 'ascii' || f.reply.kind !== 'sn') throw new Error('expected sn');
    expect(f.reply.data).toEqual({ gatewaySn: 'GW123' });
  });

  it('parses VER into dotted decimals', () => {
    const f = decodeFrame(ascii('YICHU|VER|010709|0100|0100|0101|0100\r\n'));
    if (f.type !== 'ascii' || f.reply.kind !== 'ver') throw new Error('expected ver');
    expect(f.reply.data.softwareVersion).toBe('1.7.9');
    expect(f.reply.data.hdInverterAcVersion).toBe('1.1');
  });
});

describe('binary responses', () => {
  const allOff: SwitchStates = {
    acOutput: false,
    dcOutput: false,
    usbOutput: false,
    acChargerConnected: false,
    dcChargerConnected: false,
    acConstantPower: false,
    silentMode: false,
    keySound: false,
    wifi: false,
  };

  it('decodes a hand-made 50 status frame', () => {
    // bits 1 (AC), 3 (USB), 5 (DC charger), 10 (WiFi) → 0x042a
    const frame = '574c00105000020' + '42a';
    const full = frame + bytesToHex(crcLE(hexToBytes(frame)));
    const f = decodeFrame(full);
    if (f.type !== 'status') throw new Error('expected status');
    expect(f.bitmap).toBe(0x042a);
    expect(f.data).toEqual({
      ...allOff,
      acOutput: true,
      usbOutput: true,
      dcChargerConnected: true,
      wifi: true,
    });
    expect(f.frame.crcOk).toBe(true);
  });

  it('round-trips 50 status', () => {
    const s = { ...allOff, dcOutput: true, silentMode: true, keySound: true };
    const f = decodeFrame(encodeStatus(s));
    if (f.type !== 'status') throw new Error('expected status');
    expect(f.data).toEqual(s);
  });

  it('decodes a hand-made 51 system frame', () => {
    const w = (n: number) => n.toString(16).padStart(4, '0');
    const aaWords = [350, 0, 350, 0, 215, 160, 12, 0, 0, 5, 6, 0, 18, 20].map(w).join('');
    const abWords = [195, 0, 0, 0, 300, 0, 120, 0, 0, 280, 0, 97, 0].map(w).join('');
    const payload =
      'aa' + (aaWords.length / 2).toString(16).padStart(2, '0') + aaWords +
      'ab' + (abWords.length / 2).toString(16).padStart(2, '0') + abWords +
      'ac08' + '0000000000000000' +
      'ba05' + '00' + '14' + '3c' + '0320';
    const body = '574c001051' + (payload.length / 2).toString(16).padStart(4, '0') + payload;
    const f = decodeFrame(body + bytesToHex(crcLE(hexToBytes(body))));
    if (f.type !== 'system') throw new Error('expected system');
    expect(f.data.power).toMatchObject({
      inputW: 350,
      dcInputW: 350,
      outputW: 215,
      acOutputW: 160,
      dcOutputW: 12,
      wirelessW: 5,
      usbAW: 6,
      usbCW: 38,
      usbCPortsW: [18, 20],
    });
    expect(f.data.remainUsableTime).toBe(195);
    expect(f.data.timersSet).toEqual({ autoShutdown: 0, screenOff: 300, dcAutoOff: 0, acAutoOff: 120, usbAutoOff: 0 });
    expect(f.data.timersRemaining).toEqual({ autoShutdown: 0, screenOff: 280, dcAutoOff: 0, acAutoOff: 97, usbAutoOff: 0 });
    expect(f.data.lightWorkMode).toBe(20);
    expect(f.data.backlight).toBe(60);
    expect(f.data.chargingPowerSetting).toBe(800);
    expect(summarizeFrame(f)).toContain('in=350W');
  });

  it('round-trips 51 system', () => {
    const timers = { autoShutdown: 600, screenOff: 60, dcAutoOff: 0, acAutoOff: 30, usbAutoOff: 5 };
    const f = decodeFrame(
      encodeSystem({
        power: {
          inputW: 900, acInputW: 800, dcInputW: 100, outputW: 70, acOutputW: 50, dcOutputW: 10,
          carW: 0, wirelessW: 0, usbAW: 5, usbCPortsW: [5, 0, 0],
        },
        remainUsableTime: 0,
        timersSet: timers,
        timersRemaining: { ...timers, acAutoOff: 12 },
        lightWorkMode: 60,
        backlight: 100,
        chargingPowerSetting: 1200,
      }),
    );
    if (f.type !== 'system') throw new Error('expected system');
    expect(f.data.power?.usbCW).toBe(5);
    expect(f.data.timersSet).toEqual(timers);
    expect(f.data.timersRemaining?.acAutoOff).toBe(12);
    expect(f.data.chargingPowerSetting).toBe(1200);
    expect(f.data.lightWorkMode).toBe(60);
    expect(f.frame.crcOk).toBe(true);
  });

  it('parseSystem tolerates missing blocks', () => {
    expect(parseSystem('ba0500280a0190')).toMatchObject({ lightWorkMode: 40, backlight: 10, chargingPowerSetting: 400 });
    expect(parseSystem('').power).toBeUndefined();
  });

  it('decodes 53 battery with signed temperatures', () => {
    const f = decodeFrame(encodeBattery({ soc: 57, temperaturesC: [25.3, 26.1, -2.0] }));
    if (f.type !== 'battery') throw new Error('expected battery');
    expect(f.data.soc).toBe(57);
    expect(f.data.temperaturesC).toEqual([25.3, 26.1, -2]);
    expect(f.data.tempC).toBeCloseTo(16.5, 1);
  });

  it('53 with sensor count 0 defaults to one sensor', () => {
    const payload = new Uint8Array(32);
    payload[0] = 80;
    payload[30] = 0x01;
    payload[31] = 0x04; // 26.0 °C
    const f = decodeFrame(buildResponse(0x53, payload));
    if (f.type !== 'battery') throw new Error('expected battery');
    expect(f.data.tempC).toBe(26);
  });

  it('decodes 0C versions + serial', () => {
    const f = decodeFrame(
      encodeVersions({
        deviceSn: 'YC1K24A0019',
        mainControlVersion: '1.2.7',
        inverterDcVersion: '1.0.4',
        inverterAcVersion: '1.1.2',
        bmsVersion: '2.0.3',
        hdMainControlVersion: '1.0',
        hdInverterDcVersion: '1.0',
        hdInverterAcVersion: '1.1',
        hdBmsVersion: '1.0',
      }),
    );
    if (f.type !== 'versions') throw new Error('expected versions');
    expect(f.data).toMatchObject({ deviceSn: 'YC1K24A0019', mainControlVersion: '1.2.7', bmsVersion: '2.0.3', hdInverterAcVersion: '1.1' });
  });

  it('0C serial falls back to the app split when fa is not a clean TLV', () => {
    // ab 03 010203, then `fa` followed by one length byte the app skips, then ASCII + NUL
    const payload = 'ab03010203' + 'fa' + '20' + bytesToHex(new TextEncoder().encode('SN99')) + '00ffff';
    const f = decodeFrame(buildResponse(0x0c, hexToBytes(payload)));
    if (f.type !== 'versions') throw new Error('expected versions');
    expect(f.data.deviceSn).toBe('SN99');
  });

  it('decodes 0A model info and strips control chars', () => {
    const f = decodeFrame(encodeModelInfo('103\n', 'MGI106MG2HEU'));
    if (f.type !== 'model') throw new Error('expected model');
    expect(f.data).toEqual({ deptCode: '103', deviceModelCode: 'MGI106MG2HEU' });
  });

  it('decodes acks', () => {
    const ok = decodeFrame(encodeAck(0x60));
    const fail = decodeFrame(encodeAck(0x61, false));
    expect(ok.type === 'ack' && ok.success).toBe(true);
    expect(fail.type === 'ack' && fail.success).toBe(false);
  });

  it('flags (but keeps) a frame with a bad CRC', () => {
    const b = encodeAck(0x63);
    b[b.length - 1] = b[b.length - 1]! ^ 0xff;
    const f = decodeFrame(b);
    expect(f.type).toBe('ack');
    if (f.type === 'ack') expect(f.frame.crcOk).toBe(false);
  });

  it('returns unknown for garbage', () => {
    expect(decodeFrame('0102').type).toBe('unknown');
  });
});

describe('FrameAssembler', () => {
  it('reassembles a frame split across notifications', () => {
    const frames: string[] = [];
    const a = new FrameAssembler((h) => frames.push(h));
    const full = encodeBattery({ soc: 50, temperaturesC: [20] });
    a.push(full.subarray(0, 20));
    expect(frames).toHaveLength(0);
    a.push(full.subarray(20));
    expect(frames).toEqual([bytesToHex(full)]);
  });

  it('splits concatenated frames', () => {
    const frames: string[] = [];
    const a = new FrameAssembler((h) => frames.push(h));
    const one = encodeAck(0x60);
    const two = encodeAck(0x61);
    a.push(new Uint8Array([...one, ...two]));
    expect(frames).toEqual([bytesToHex(one), bytesToHex(two)]);
  });

  it('passes ASCII through and flushes stale partials', () => {
    let now = 0;
    const frames: string[] = [];
    const a = new FrameAssembler((h) => frames.push(h), 500, () => now);
    a.push(encodeAck(0x60).subarray(0, 5));
    now = 1000;
    a.push(new TextEncoder().encode('YICHU|SN|X\r\n'));
    expect(frames).toHaveLength(2);
    expect(frames[1]!.startsWith('5949')).toBe(true);
  });
});

function crcLE(bytes: Uint8Array): Uint8Array {
  const c = crc16Modbus(bytes);
  return new Uint8Array([c & 0xff, c >> 8]);
}
