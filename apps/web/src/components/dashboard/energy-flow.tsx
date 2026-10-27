'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { BatteryCharging, BatteryMedium, Car, Plug, Plug2, Sun, Usb, Wifi, Zap, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useFmt } from '@/lib/format';
import { useEnergy } from '@/lib/hooks/use-energy';
import { useDevice } from '@/lib/store/device-store';
import { cn } from '@/lib/utils';

type Tone = 'ac' | 'dc' | 'usb' | 'solar';

interface NodeDef {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  watts: number;
  side: 'in' | 'out';
  sub?: string;
}

interface Placed extends NodeDef {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the link attaches to the node. */
  ax: number;
  ay: number;
}

interface Link {
  id: string;
  d: string;
  tone: Tone;
  watts: number;
  active: boolean;
  speed: number;
  count: number;
}

const TONE_VAR: Record<Tone, string> = { ac: 'var(--ac)', dc: 'var(--dc)', usb: 'var(--usb)', solar: 'var(--solar)' };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Particle speed in px/s grows with the log of power; idle links have no particles. */
const speedFor = (w: number) => 26 + 46 * Math.log10(1 + w / 8);
const countFor = (w: number) => Math.max(2, Math.min(7, Math.round(2 + w / 120)));

export function EnergyFlow() {
  const t = useTranslations('dashboard');
  const fmt = useFmt();
  const locale = useLocale();
  const rtl = locale === 'fa';
  const reduce = useReducedMotion();
  const power = useDevice((s) => s.telemetry.power);
  const switches = useDevice((s) => s.telemetry.switches);
  const soc = useDevice((s) => s.telemetry.soc);
  const e = useEnergy();
  const [ref, width] = useWidth<HTMLDivElement>();

  const nodes: NodeDef[] = useMemo(
    () => [
      { id: 'acIn', label: t('acIn'), icon: Plug, tone: 'ac', watts: power?.acInputW ?? 0, side: 'in', sub: switches?.acChargerConnected ? t('connectedCharger') : undefined },
      { id: 'dcIn', label: t('dcIn'), icon: Sun, tone: 'solar', watts: power?.dcInputW ?? 0, side: 'in', sub: switches?.dcChargerConnected ? t('connectedCharger') : undefined },
      { id: 'acOut', label: t('acOut'), icon: Plug2, tone: 'ac', watts: power?.acOutputW ?? 0, side: 'out' },
      { id: 'dcOut', label: t('dcOut'), icon: Zap, tone: 'dc', watts: power?.dcOutputW ?? 0, side: 'out' },
      { id: 'car', label: t('car'), icon: Car, tone: 'dc', watts: power?.carW ?? 0, side: 'out' },
      { id: 'usbA', label: t('usbA'), icon: Usb, tone: 'usb', watts: power?.usbAW ?? 0, side: 'out' },
      { id: 'usbC', label: t('usbC'), icon: Usb, tone: 'usb', watts: power?.usbCW ?? 0, side: 'out' },
      { id: 'wireless', label: t('wireless'), icon: Wifi, tone: 'usb', watts: power?.wirelessW ?? 0, side: 'out' },
    ],
    [power, switches, t],
  );

  const layout = useMemo(() => {
    if (!width) return null;
    const compact = width < 560;
    const inW = compact ? Math.min(104, width * 0.29) : Math.min(168, width * 0.21);
    const outW = compact ? Math.min(112, width * 0.31) : Math.min(168, width * 0.21);
    const nodeH = compact ? 44 : 50;
    const gap = compact ? 8 : 10;
    const R = compact ? Math.min(46, width * 0.12) : 62;
    const outs = nodes.filter((n) => n.side === 'out');
    const ins = nodes.filter((n) => n.side === 'in');
    const stack = outs.length * nodeH + (outs.length - 1) * gap;
    const h = stack + 12;
    const cx = inW + (width - inW - outW) / 2;
    const cy = h / 2;
    const mirror = (x: number) => (rtl ? width - x : x);

    const placed: Placed[] = [];
    ins.forEach((n, i) => {
      const y = h * (i === 0 ? 0.3 : 0.7);
      placed.push({ ...n, x: rtl ? width - inW : 0, y: y - nodeH / 2, w: inW, h: nodeH, ax: mirror(inW), ay: y });
    });
    outs.forEach((n, i) => {
      const y = 6 + i * (nodeH + gap) + nodeH / 2;
      placed.push({ ...n, x: rtl ? 0 : width - outW, y: y - nodeH / 2, w: outW, h: nodeH, ax: mirror(width - outW), ay: y });
    });

    const links: Link[] = placed.map((n) => {
      const idx = n.side === 'in' ? ins.findIndex((x) => x.id === n.id) : outs.findIndex((x) => x.id === n.id);
      const total = n.side === 'in' ? ins.length : outs.length;
      const spread = (idx - (total - 1) / 2) * (R * 0.32);
      const bx = mirror(cx + (n.side === 'in' ? -R : R) * Math.cos(Math.asin(Math.max(-0.9, Math.min(0.9, spread / R)))));
      const by = cy + spread;
      const [x1, y1, x2, y2] = n.side === 'in' ? [n.ax, n.ay, bx, by] : [bx, by, n.ax, n.ay];
      const mx = (x1 + x2) / 2;
      const active = n.watts > 0;
      return {
        id: n.id,
        d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        tone: n.tone === 'solar' ? 'dc' : n.tone,
        watts: n.watts,
        active,
        speed: speedFor(n.watts),
        count: active ? countFor(n.watts) : 0,
      };
    });
    return { h, cx: mirror(cx), cy, R, placed, links, compact };
  }, [width, nodes, rtl]);

  // ---- particles: driven by rAF so speed changes stay smooth
  const pathEls = useRef(new Map<string, SVGPathElement>());
  const dotEls = useRef(new Map<string, (SVGCircleElement | null)[]>());
  const linksRef = useRef<Link[]>([]);
  linksRef.current = layout?.links ?? [];

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let last = performance.now();
    const progress = new Map<string, number>();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const link of linksRef.current) {
        const path = pathEls.current.get(link.id);
        const dots = dotEls.current.get(link.id);
        if (!path || !dots || !link.active) continue;
        const len = path.getTotalLength();
        if (!len) continue;
        const p = ((progress.get(link.id) ?? Math.random()) + (dt * link.speed) / len) % 1;
        progress.set(link.id, p);
        dots.forEach((dot, i) => {
          if (!dot) return;
          const q = (p + i / dots.length) % 1;
          const pt = path.getPointAtLength(q * len);
          dot.setAttribute('cx', pt.x.toFixed(1));
          dot.setAttribute('cy', pt.y.toFixed(1));
          dot.setAttribute('opacity', String(Math.min(1, q * 6, (1 - q) * 6)));
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  const batteryTone = e.direction === 'charging' ? 'var(--charge)' : e.direction === 'discharging' ? 'var(--discharge)' : 'var(--muted-foreground)';
  const BatteryIcon = e.direction === 'charging' ? BatteryCharging : BatteryMedium;

  return (
    <Card className="flex h-full flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('flowTitle')}</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Legend tone="ac" label="AC" />
          <Legend tone="dc" label="DC" />
          <Legend tone="usb" label="USB" />
        </div>
      </div>
      <div ref={ref} className="relative w-full flex-1" style={{ minHeight: layout?.h ?? 320 }}>
        {layout && (
          <div className="relative" style={{ height: layout.h }} role="img" aria-label={`${t('flowTitle')}: ${t('input')} ${fmt.watts(e.inW)}, ${t('output')} ${fmt.watts(e.outW)}`}>
            <svg width={width} height={layout.h} className="absolute inset-0 overflow-visible" aria-hidden>
              <defs>
                <filter id="dot-glow" x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur stdDeviation="2.4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {layout.links.map((l) => (
                <g key={l.id}>
                  <path
                    ref={(el) => {
                      if (el) pathEls.current.set(l.id, el);
                      else pathEls.current.delete(l.id);
                    }}
                    d={l.d}
                    fill="none"
                    stroke={l.active ? TONE_VAR[l.tone] : 'var(--track)'}
                    strokeOpacity={l.active ? 0.35 : 1}
                    strokeWidth={l.active ? 2 + Math.min(3, l.watts / 250) : 1.5}
                    strokeDasharray={l.active ? undefined : '3 5'}
                    strokeLinecap="round"
                    className="transition-[stroke,stroke-width] duration-500"
                  />
                  {reduce && l.active && (
                    <path d={l.d} fill="none" stroke={TONE_VAR[l.tone]} strokeWidth={2} strokeDasharray="2 10" strokeLinecap="round" />
                  )}
                  {!reduce && (
                    <g filter="url(#dot-glow)">
                      {Array.from({ length: l.count }, (_, i) => (
                        <circle
                          key={i}
                          ref={(el) => {
                            const arr = dotEls.current.get(l.id) ?? [];
                            arr[i] = el;
                            arr.length = l.count;
                            dotEls.current.set(l.id, arr);
                          }}
                          r={layout.compact ? 2.4 : 3}
                          cx={-10}
                          cy={-10}
                          fill={TONE_VAR[l.tone]}
                        />
                      ))}
                    </g>
                  )}
                </g>
              ))}
            </svg>

            {/* Battery */}
            <div
              className="absolute grid place-items-center rounded-full"
              style={{ left: layout.cx - layout.R, top: layout.cy - layout.R, width: layout.R * 2, height: layout.R * 2 }}
            >
              <div
                className="absolute inset-0 rounded-full transition-[background] duration-700"
                style={{
                  background: `conic-gradient(${batteryTone} ${(soc ?? 0) * 3.6}deg, var(--track) 0deg)`,
                  mask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))',
                  WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))',
                  transform: rtl ? 'scaleX(-1)' : undefined,
                }}
              />
              <div
                className="absolute inset-[6px] rounded-full bg-card-solid/90 transition-shadow duration-700"
                style={{ boxShadow: `0 0 40px -6px color-mix(in oklab, ${batteryTone} calc(var(--glow-strength) * 90%), transparent)` }}
              />
              <div className="relative flex flex-col items-center leading-none">
                <BatteryIcon className={layout.compact ? 'size-4' : 'size-5'} style={{ color: batteryTone }} />
                <span className={cn('mt-1 font-semibold tabular', layout.compact ? 'text-base' : 'text-xl')}>{fmt.pct(soc)}</span>
                {!layout.compact && <span className="mt-1 text-[11px] text-muted-foreground">{t('battery')}</span>}
              </div>
            </div>

            {layout.placed.map((n) => (
              <FlowNode key={n.id} node={n} compact={layout.compact} label={n.label} value={fmt.watts(n.watts)} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function FlowNode({ node, compact, label, value }: { node: Placed; compact: boolean; label: string; value: string }) {
  const active = node.watts > 0;
  const Icon = node.icon;
  const left = node.x;
  return (
    <div
      className={cn(
        'absolute flex items-center gap-2 rounded-xl border px-2 transition-[background,border-color,opacity] duration-500',
        active ? 'border-border bg-card-solid/80 shadow-sm' : 'border-transparent bg-muted/40 opacity-60',
      )}
      style={{ left, top: node.y, width: node.w, height: node.h }}
    >
      <span
        className="grid shrink-0 place-items-center rounded-lg transition-colors"
        style={{
          width: compact ? 26 : 32,
          height: compact ? 26 : 32,
          background: active ? `color-mix(in oklab, ${TONE_VAR[node.tone]} 18%, transparent)` : 'var(--track)',
          color: active ? TONE_VAR[node.tone] : 'var(--muted-foreground)',
        }}
      >
        <Icon className={compact ? 'size-3.5' : 'size-4'} />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn('truncate text-muted-foreground', compact ? 'text-[10px]' : 'text-[11px]')}>{label}</span>
        <span className={cn('truncate font-semibold tabular', compact ? 'text-xs' : 'text-sm')}>{value}</span>
      </span>
    </div>
  );
}

function Legend({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: TONE_VAR[tone] }} />
      {label}
    </span>
  );
}
