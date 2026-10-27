import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('MyEnergy API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
    const prisma = app.get(PrismaService);
    await prisma.telemetrySample.deleteMany();
    await prisma.session.deleteMany();
    await prisma.device.deleteMany();
    await prisma.setting.deleteMany();
    await prisma.appliancePreset.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /health', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body.ok).toBe(true);
  });

  describe('devices', () => {
    it('upserts and merges versions', async () => {
      await http()
        .post('/devices/upsert')
        .send({ sn: 'SN1', modelCode: 'MGI106MG2HEU', versions: { bmsVersion: '2.0.3' } })
        .expect(201);
      const res = await http()
        .post('/devices/upsert')
        .send({ sn: 'SN1', name: 'Garage', versions: { mainControlVersion: '1.2.7' } })
        .expect(201);
      expect(res.body).toMatchObject({
        sn: 'SN1',
        name: 'Garage',
        modelCode: 'MGI106MG2HEU',
        versions: { bmsVersion: '2.0.3', mainControlVersion: '1.2.7' },
      });
      const list = await http().get('/devices').expect(200);
      expect(list.body).toHaveLength(1);
    });

    it('validates input', async () => {
      const res = await http().post('/devices/upsert').send({ capacityWh: 'lots' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, path: '/devices/upsert' });
      expect(Array.isArray(res.body.message)).toBe(true);
    });

    it('404s unknown devices with the uniform error shape', async () => {
      const res = await http().get('/devices/nope').expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'NOT_FOUND' });
    });
  });

  describe('telemetry', () => {
    const base = Date.UTC(2026, 0, 1, 12, 0, 0);
    const batch = (from: number, n: number, inW: number) =>
      Array.from({ length: n }, (_, i) => ({ ts: base + (from + i) * 1000, soc: 60, tempC: 25, inW, outW: 100 }));

    it('stores batches averaged into 5 s buckets, merging across batches', async () => {
      await http().post('/telemetry').send({ deviceSn: 'SN1', samples: batch(0, 7, 200) }).expect(202);
      // second batch continues the 5..9 s bucket
      const r = await http().post('/telemetry').send({ deviceSn: 'SN1', samples: batch(7, 3, 400) }).expect(202);
      expect(r.body.stored).toBe(1);
      const res = await http()
        .get('/telemetry')
        .query({ deviceId: 'SN1', from: String(base - 1000), to: String(base + 60_000), bucket: '5s' })
        .expect(200);
      expect(res.body.bucket).toBe('5s');
      expect(res.body.points).toHaveLength(2);
      expect(res.body.points[0]).toMatchObject({ inW: 200, outW: 100, soc: 60 });
      // bucket 5..9: 2 samples at 200 W + 3 at 400 W
      expect(res.body.points[1].inW).toBe(320);
      expect(res.body.summary.peakInW).toBe(320);
    });

    it('downsamples on read', async () => {
      const res = await http()
        .get('/telemetry')
        .query({ deviceId: 'SN1', from: new Date(base - 1000).toISOString(), to: new Date(base + 60_000).toISOString(), bucket: '1m' })
        .expect(200);
      expect(res.body.points).toHaveLength(1);
      expect(res.body.points[0].inW).toBe(260);
    });

    it('rejects bad batches and bad ranges', async () => {
      await http().post('/telemetry').send({ deviceSn: 'SN1', samples: [] }).expect(400);
      await http()
        .post('/telemetry')
        .send({ deviceSn: 'SN1', samples: [{ ts: 1, soc: 150, inW: 0, outW: 0 }] })
        .expect(400);
      await http().get('/telemetry').query({ deviceId: 'SN1', from: '2', to: '1' }).expect(400);
      await http().get('/telemetry').query({ deviceId: 'SN1', bucket: '7m' }).expect(400);
    });
  });

  describe('sessions', () => {
    it('starts, updates and ends a session', async () => {
      const s = await http().post('/sessions').send({ deviceSn: 'SN2', transport: 'demo' }).expect(201);
      const u = await http().patch(`/sessions/${s.body.id}`).send({ whIn: 12.5, whOut: 3, ended: true }).expect(200);
      expect(u.body).toMatchObject({ whIn: 12.5, whOut: 3, transport: 'demo' });
      expect(u.body.endedAt).toBeTruthy();
      const list = await http().get('/sessions').query({ deviceId: 'SN2' }).expect(200);
      expect(list.body).toHaveLength(1);
      await http().patch('/sessions/missing').send({ whIn: 1 }).expect(404);
    });
  });

  describe('settings', () => {
    it('merges settings and strips unknown keys', async () => {
      await http().put('/settings').send({ capacityWh: 2048, hacker: true }).expect(200);
      const res = await http().put('/settings').send({ locale: 'fa' }).expect(200);
      expect(res.body).toEqual({ capacityWh: 2048, locale: 'fa' });
      expect((await http().get('/settings').expect(200)).body).toEqual({ capacityWh: 2048, locale: 'fa' });
      await http().put('/settings').send({ effAc: 3 }).expect(400);
      await http().put('/settings').send({ customServiceUuid: 'not-a-uuid' }).expect(400);
      await http().put('/settings').send({ customServiceUuid: 'fff0' }).expect(200);
    });
  });

  describe('appliances', () => {
    it('seeds defaults and supports CRUD', async () => {
      const list = await http().get('/appliances').expect(200);
      expect(list.body.length).toBeGreaterThan(5);
      expect(list.body.find((a: { name: string }) => a.name === 'Fridge')).toMatchObject({ watts: 150 });
      const created = await http().post('/appliances').send({ name: 'Heater', watts: 800, rail: 'ac' }).expect(201);
      const updated = await http().patch(`/appliances/${created.body.id}`).send({ dutyPct: 30 }).expect(200);
      expect(updated.body.dutyPct).toBe(30);
      await http().delete(`/appliances/${created.body.id}`).expect(204);
      await http().delete(`/appliances/${created.body.id}`).expect(404);
      await http().post('/appliances').send({ name: 'Bad', watts: -1 }).expect(400);
    });
  });

  describe('live gateway', () => {
    const connect = () =>
      new Promise<Socket>((resolve, reject) => {
        const s = io(`${baseUrl.replace('[::1]', 'localhost')}/live`, { transports: ['websocket'], forceNew: true });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });

    it('re-broadcasts telemetry to watchers of the device room', async () => {
      const publisher = await connect();
      const watcher = await connect();
      try {
        await watcher.emitWithAck('subscribe', { sn: 'LIVE1' });
        const received = new Promise<{ sn: string; snapshot: { soc: number } }>((r) => watcher.once('telemetry', r));
        const ack = await publisher.emitWithAck('telemetry', { sn: 'LIVE1', name: 'Demo', snapshot: { soc: 77 } });
        expect(ack).toEqual({ ok: true });
        await expect(received).resolves.toMatchObject({ sn: 'LIVE1', snapshot: { soc: 77 } });
        const devices = await http().get('/live/devices').expect(200);
        expect(devices.body).toEqual([expect.objectContaining({ sn: 'LIVE1', name: 'Demo' })]);
        const offline = new Promise((r) => watcher.once('offline', r));
        publisher.disconnect();
        await expect(offline).resolves.toEqual({ sn: 'LIVE1' });
        expect((await http().get('/live/devices').expect(200)).body).toEqual([]);
      } finally {
        publisher.disconnect();
        watcher.disconnect();
      }
    });

    it('rejects malformed telemetry', async () => {
      const s = await connect();
      try {
        expect(await s.emitWithAck('telemetry', { snapshot: {} })).toMatchObject({ ok: false });
        expect(await s.emitWithAck('telemetry', { sn: 'X', snapshot: 'nope' })).toMatchObject({ ok: false });
      } finally {
        s.disconnect();
      }
    });
  });
});
