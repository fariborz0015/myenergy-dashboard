'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FlaskConical, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { deviceConnection } from '@/lib/device/connection';
import { useFmt } from '@/lib/format';
import { useDevice } from '@/lib/store/device-store';

/** Knobs for the simulator so every UI state can be demonstrated without hardware. */
export function DemoPanel() {
  const t = useTranslations('demo');
  const fmt = useFmt();
  const mode = useDevice((s) => s.mode);
  const status = useDevice((s) => s.status);
  const sim = deviceConnection.demo;
  const [scenario, setScenario] = useState(() => sim?.sim.state.scenario ?? null);
  const [speed, setSpeed] = useState(String(sim?.timeScale ?? 1));

  useEffect(() => {
    setScenario(deviceConnection.demo ? { ...deviceConnection.demo.sim.state.scenario } : null);
    setSpeed(String(deviceConnection.demo?.timeScale ?? 1));
  }, [mode, status]);

  if (mode !== 'demo' || !scenario) return null;
  const patch = (p: Partial<typeof scenario>) => {
    deviceConnection.demo?.sim.setScenario(p);
    setScenario({ ...scenario, ...p });
  };

  return (
    <Card className="flex flex-col gap-4 border-dashed p-5">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-dc" />
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <span className="text-xs text-muted-foreground">— {t('description')}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
          <Label htmlFor="demo-solar" className="font-normal">{t('solar')}</Label>
          <Switch id="demo-solar" tone="charge" checked={scenario.solar} onCheckedChange={(v) => patch({ solar: v })} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
          <Label htmlFor="demo-ac" className="font-normal">{t('acCharger')}</Label>
          <Switch id="demo-ac" tone="ac" checked={scenario.acCharger} onCheckedChange={(v) => patch({ acCharger: v })} />
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted/50 px-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <Label htmlFor="demo-load" className="font-normal">{t('extraLoad')}</Label>
            <span className="tabular">{fmt.watts(scenario.extraAcLoadW)}</span>
          </div>
          <Slider id="demo-load" thumbLabel={t('extraLoad')} min={0} max={1000} step={25} value={[scenario.extraAcLoadW]} onValueChange={([v]) => patch({ extraAcLoadW: v ?? 0 })} />
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl bg-muted/50 px-3 py-2">
          <span className="text-sm">{t('speed')}</span>
          <Segmented
            ariaLabel={t('speed')}
            value={speed}
            onValueChange={(v) => {
              setSpeed(v);
              if (deviceConnection.demo) deviceConnection.demo.timeScale = Number(v);
            }}
            options={['1', '10', '60'].map((v) => ({ value: v, label: `${fmt.num(Number(v))}×` }))}
          />
        </div>
      </div>
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => deviceConnection.simulateLinkLoss()}>
        <Unplug />
        {t('linkLoss')}
      </Button>
    </Card>
  );
}
