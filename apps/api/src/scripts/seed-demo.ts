/**
 * Fills the database with 48 h of history for the demo device by running the shared
 * simulator and decoding its frames exactly like the browser does.
 *   pnpm --filter @myenergy/api seed:demo
 */
import '../common/load-env';
import { decodeFrame, PowerStationSimulator, switchesToBitmap } from '@myenergy/protocol';
import { PrismaClient } from '@prisma/client';

const HOURS = Number(process.env.SEED_HOURS ?? 48);
const STEP_S = 5;

async function main() {
  const prisma = new PrismaClient();
  const sim = new PowerStationSimulator({ seed: 42, initialSoc: 64 });
  sim.state.timersSet.acAutoOff = 0;
  sim.state.chargeLimitW = 400;
  const { info } = sim;
  const device = await prisma.device.upsert({
    where: { sn: info.deviceSn },
    create: {
      sn: info.deviceSn,
      gatewaySn: info.gatewaySn,
      modelCode: info.deviceModelCode,
      deptCode: info.deptCode,
      name: `INFINITY 1000 ${info.deviceSn.slice(-4)}`,
      capacityWh: info.capacityWh,
      versions: JSON.stringify(info.versions),
    },
    update: {},
  });
  await prisma.telemetrySample.deleteMany({ where: { deviceId: device.id } });

  const end = Math.floor(Date.now() / 1000 / STEP_S) * STEP_S * 1000;
  const start = end - HOURS * 3600 * 1000;
  const rows = [];
  for (let ts = start; ts <= end; ts += STEP_S * 1000) {
    const hourOfDay = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
    const daylight = hourOfDay > 6.5 && hourOfDay < 19;
    sim.setScenario({
      solar: daylight,
      solarPeakW: daylight ? 560 * Math.sin(((hourOfDay - 6.5) / 12.5) * Math.PI) : 0,
      acCharger: hourOfDay >= 0.5 && hourOfDay < 5, // cheap night tariff top-up
      extraAcLoadW: hourOfDay > 19 && hourOfDay < 22.5 ? 85 : 0, // evening TV
    });
    sim.tick(STEP_S);
    const sys = decodeFrame(sim.systemFrame());
    const bat = decodeFrame(sim.batteryFrame());
    if (sys.type !== 'system' || bat.type !== 'battery' || !sys.data.power) continue;
    const p = sys.data.power;
    rows.push({
      deviceId: device.id,
      ts: new Date(ts),
      soc: bat.data.soc,
      tempC: bat.data.tempC,
      inW: p.inputW,
      outW: p.outputW,
      acInW: p.acInputW,
      dcInW: p.dcInputW,
      acOutW: p.acOutputW,
      dcOutW: p.dcOutputW,
      usbAW: p.usbAW,
      usbCW: p.usbCW,
      carW: p.carW,
      wirelessW: p.wirelessW,
      switches: switchesToBitmap(sim.state.switches),
      n: STEP_S,
    });
    // Keep the demo alive: switch outputs back on if an empty battery turned them off.
    Object.assign(sim.state.switches, { acOutput: true, dcOutput: true, usbOutput: true });
  }
  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.telemetrySample.createMany({ data: rows.slice(i, i + 2000) });
  }
  console.log(`Seeded ${rows.length} samples (${HOURS} h) for ${info.deviceSn}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
