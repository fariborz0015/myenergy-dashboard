# MyEnergy Dashboard

A web dashboard for the **INFINITY 1000** portable power station (BLE name `YIchu…`, the device behind the *MyEnergy Power* Android app). The browser talks to the station directly over **Web Bluetooth**. It shows live power per rail, state of charge, temperature, switches and timers, lets you control the station, and estimates how long the battery will last.

| Dashboard (dark) | Dashboard (light, phone) | Persian / RTL |
| --- | --- | --- |
| ![](docs/screenshots/dashboard-desktop-dark.png) | ![](docs/screenshots/dashboard-mobile-light.png) | ![](docs/screenshots/dashboard-mobile-dark-fa.png) |

More in [`docs/screenshots`](docs/screenshots): every page at desktop and phone width, in dark and light.

## What's inside

```
packages/protocol   Dependency-free TS: frame builder, Modbus CRC, decoders, simulator, energy math (browser + Node)
apps/web            Next.js 15 · React 19 · Tailwind v4 · shadcn/ui · framer-motion · Zustand · Recharts · next-intl
apps/api            NestJS 11 · Prisma + SQLite · REST + Socket.IO (/live) · Swagger at /docs
```

- **Connect** (`/`): connect over Bluetooth, start the demo device, or watch a station that another browser is streaming. It detects whether the browser supports Web Bluetooth and explains what to do if it doesn't.
- **Dashboard** (`/dashboard`):
  - SOC ring with the runtime estimate (or time to full), next to the station's own estimate.
  - Animated energy-flow diagram; particle speed scales with watts.
  - AC/DC/USB cards with optimistic switches.
  - 10-minute sparkline and Wh counters for today and this session.
  - Controls sheet: charge limit, timers, light, backlight, modes.
  - Wi-Fi setup, connection details (GATT table, firmware), demo controls, and a raw frame console.
- **Planner** (`/planner`): what-if load planner with duty cycles, "how long can I run X", and the reverse "I need N hours → max load".
- **History** (`/history`): telemetry downsampled by the API, with energy totals. If the API is down it falls back to the current session's data.
- **Settings** (`/settings`): capacity and efficiencies, alert thresholds, custom service UUID, API sync, theme, language (English / فارسی with RTL and Persian digits), and °C/°F.

The web app works fully on its own with the demo device. The API is optional.

## Requirements

- Node ≥ 20.12 (developed on Node 22), pnpm 10 (`corepack enable`)
- For a real device: a browser with Web Bluetooth (see below)

## Run it

```bash
pnpm install
pnpm dev            # web on http://localhost:3000, API on http://localhost:4000 (Swagger: /docs)
```

`pnpm dev` builds the protocol package first. On first run it also creates `apps/api/.env` from `.env.example` and the SQLite database (`apps/api/prisma/dev.db`).

To get sample history for the History page (48 h for the demo station):

```bash
pnpm --filter @myenergy/api build
pnpm --filter @myenergy/api seed:demo
```

Quality gates, all run from the root:

```bash
pnpm build          # protocol (tsup), api (nest), web (next)
pnpm test           # Vitest (protocol + web) and Jest (api unit + e2e on a throwaway SQLite DB)
pnpm lint
pnpm test:e2e       # Playwright smoke test (desktop + phone) against a production build; uses local Chrome
```

`test:e2e` uses the installed Google Chrome by default. Set `PW_CHANNEL=` (empty) and run `pnpm --filter @myenergy/web exec playwright install chromium` to use Playwright's own Chromium. `SCREENSHOTS=1 pnpm --filter @myenergy/web exec playwright test screenshots --project=desktop` regenerates `docs/screenshots` (start the API first so History has data).

Environment variables: `apps/web/.env.example` (`NEXT_PUBLIC_API_URL`) and `apps/api/.env.example` (`DATABASE_URL`, `PORT`, `WEB_ORIGIN`, `TELEMETRY_STORE_BUCKET_S`).

## Browser support for Web Bluetooth

| Platform | Works? |
| --- | --- |
| Chrome / Edge on Windows, macOS, ChromeOS | ✅ |
| Chrome on Android | ✅ (the best target: the UI is phone-first) |
| Chrome on Linux | ✅ (you may need `chrome://flags/#enable-experimental-web-platform-features`) |
| Safari (macOS / iOS), Firefox | ❌ No Web Bluetooth. On iPhone/iPad use the **Bluefy** browser |

The page must be served from **`https://` or `http://localhost`**, which Web Bluetooth requires. To use a phone during development, either:
- tunnel the dev server over HTTPS, or
- use Chrome's `chrome://inspect` port forwarding so the phone reaches it as `localhost`.

## Connecting a real device

1. Turn the station on and keep it within a few metres. Make sure no phone running the official app is connected to it, because BLE allows one central at a time.
2. Click **Connect via Bluetooth** and pick `YIchu…` in the chooser. If it isn't listed, use **Show all Bluetooth devices**.
3. The app then mirrors the original app's flow:
   - It discovers the primary services and uses the **first characteristic that has read + write + notify** for both writes and notifications.
   - It starts notifications.
   - It sends `YICHU|SN|?` at +100 ms, `YICHU|VER?` at +300 ms, `0C` at +500 ms and `0A` at +700 ms.
   - The station then streams `50` / `51` / `53` frames on its own.
4. If the link drops, it reconnects automatically (3 attempts, like the app's `maxContectSize = 3`).

### Finding your device's service UUID

Web Bluetooth only exposes services that the page lists in `optionalServices`. The original app hard-codes no UUID, so we pass a broad candidate list:
- `0xfff0`, `0xffe0`, `0xffe5`, `0xff00`, `0xff10`, `0xffd0`, `0xae00`, `0xfee7`
- `0x1800`, `0x1801`, `0x180a`, `0x180f`
- the Nordic UART service `6e400001-…`

If the station connects but **no service / characteristic appears** (Dashboard → *Details* shows "No services were accessible"):

1. Install **nRF Connect** on a phone, scan, and connect to `YIchu…`.
2. Note the UUID of the service whose characteristic has **Read, Write and Notify**.
3. Paste it into **Settings → Connection → Custom service UUID**. Both forms work: `fff0` or a full 128-bit UUID.
4. Reconnect. In **Details** you can also pin a different characteristic manually; the choice is remembered.

## Protocol notes (from the reverse-engineered app)

Everything runs over one characteristic. The protocol is implemented in [`packages/protocol`](packages/protocol/src).

- **ASCII layer**: replies start with `YI`:
  - `YICHU|SN|?\r\n` → `YICHU|SN|<gatewaySn>|<deviceSn>|<dept>|<model>`
  - `YICHU|VER?` → `YICHU|VER|<sw>|<hdMain>|<hdDc>|<hdAc>|<hdBms>`
  - Wi-Fi provisioning: `YICHU|WIFI|<ssid>|<pass>\r\n`, then `YICHU|WIFI_RESET` at +500 ms, then Wi-Fi switch off at +1500 ms and on at +1800 ms
  - `YICHU|WIFI_CTL|CLEAN` clears the Wi-Fi config
- **Binary requests**: `4D4D 0010 <cmd> <len u16 BE> <payload> <CRC-16/Modbus, low byte first>`.
  - `0C` versions + serial
  - `0A` dept/model
  - `60` switches A0–A6
  - `61` timers A0–A4
  - `62` charge limit
  - `63` light (A0) / backlight (A1)
- **Binary responses**: `574C xxxx <cmd> <len> <payload> <crc>`.
  - `50` is the switch bitmap.
  - `51` holds the power / timer / light / charge-limit blocks.
  - `53` is the battery frame: SOC, sensor count at byte 29, then i16 × 0.1 °C.
  - `60`/`61`/`63` are acks (`00` = OK).
  - Long frames that arrive split across notifications are reassembled using the length field.

Details from the bundle that the original brief didn't capture:
- The `51` block length byte is a **byte count** (the app reads `2 × len` hex characters), not a word count.
- The **screen-off timer (`61 A1`) is in seconds** (the app's picker multiplies by 60). The other timers are in minutes.
- `0` means "never" for all timers.
- The app offers light modes off/low/high/SOS (0/20/40/60).
- The app's default max charge power is 350 W; `MGI106MG2HEU` maps to 1200 W.

**Out of scope:** OTA firmware updates (`YC-OTA-START` … `YC-OTA-RES`) are deliberately not implemented. A failed flash could brick the station, and the firmware files come from the vendor's cloud.

## Unverified (no hardware was available)

Everything was built and tested against the simulator, which encodes frames from the documented layout. These points still need a real device:

- **Response CRC coverage.** Requests are verified against the app's vectors. For responses we *assume* CRC-16/Modbus over all preceding bytes, low byte first. A mismatch only logs a warning (shown in the raw console); the frame is kept.
- **The `00 10` request header bytes** and **response bytes 2–3** have unknown meaning. The simulator echoes `00 10`.
- **Units of `remainUsableTime`** (`51`/`ab` word 0) are treated as minutes, and we assume `0` means "not discharging".
- **The `0C` serial**: we read it as a `fa` TLV and fall back to the app's `split('fa')` approach.
- **Frame period** of `50`/`51`/`53` (the simulator uses 1–2 s) and **which service UUID** the station exposes.
- **Battery capacity presets** are guesses (`MGI106*` → 1024 Wh, `MGI032*` → 320 Wh) and can be overridden in Settings.
- **Chrome's MTU.** Chrome negotiates the MTU itself; pages can't request 500 like the app does. Long notifications are reassembled, but if the station truncates instead of splitting them, frames will be cut short.

## Known Web Bluetooth limitations

- No Safari or Firefox support. On iOS only third-party browsers such as Bluefy work.
- Pages need HTTPS or localhost, and the device chooser must be opened by a user gesture. Auto-reconnect only works while the tab is open; a page reload means choosing the device again.
- Only services listed in `optionalServices` are visible (see above).
- One central at a time: close the official app before connecting.
- Background tabs may be throttled, so energy counters do not bridge gaps longer than 10 s.
- The Wi-Fi password travels **in plain text** over BLE, because the device protocol has no encryption. The UI warns about this and masks it in the frame log.

## Architecture

```
Browser ──Web Bluetooth──▶ WebBluetoothTransport ┐
        (or Demo) ─────▶ SimulatorTransport ─────┤ DeviceTransport
                                                  ▼
                 DeviceConnection (write queue 100 ms, reassembly, decode, reconnect)
                                                  ▼
                 Zustand stores ──▶ React UI (dashboard, planner, …)
                                                  │ every 1 s / 5 s (best effort)
                                                  ▼
          NestJS API: POST /telemetry · /devices/upsert · /sessions · /settings · /appliances
                      Socket.IO /live: emit `telemetry` → room device:<sn> → watchers
```

### API

Full docs are in Swagger at `http://localhost:4000/docs`.

- `POST /devices/upsert`
- `GET /devices`
- `POST /telemetry`: batches of 1 Hz samples, averaged into 5 s buckets and merged across batches by weight
- `GET /telemetry?deviceId&from&to&bucket=1m`: server-side downsampling plus an energy summary
- `DELETE /telemetry?deviceId`
- `POST/PATCH/GET /sessions`
- `GET/PUT /settings`
- CRUD `/appliances` (default presets are seeded)
- `GET /live/devices`
- `GET /health`
