'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deviceConnection } from '@/lib/device/connection';
import { displayName, useDevice } from '@/lib/store/device-store';
import { cn } from '@/lib/utils';

const VERSION_KEYS = [
  'softwareVersion',
  'mainControlVersion',
  'inverterDcVersion',
  'inverterAcVersion',
  'bmsVersion',
  'hdMainControlVersion',
  'hdInverterDcVersion',
  'hdInverterAcVersion',
  'hdBmsVersion',
] as const;

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-end', mono && 'font-mono text-xs')}>{value || '—'}</dd>
    </div>
  );
}

export function DetailsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('details');
  const tc = useTranslations('common');
  const ts = useTranslations('status');
  const info = useDevice((s) => s.info);
  const mode = useDevice((s) => s.mode);
  const gatt = useDevice((s) => s.gatt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('close')} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{displayName(info)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('device')}</h3>
            <dl className="divide-y divide-border">
              <Row label={t('name')} value={info.bleName ?? displayName(info)} />
              <Row label={t('transport')} value={mode ? ts(mode) : null} />
              <Row label={t('sn')} value={info.deviceSn} mono />
              <Row label={t('gatewaySn')} value={info.gatewaySn} mono />
              <Row label={t('model')} value={info.modelCode} mono />
              <Row label={t('dept')} value={info.deptCode} mono />
            </dl>
          </section>
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('firmware')}</h3>
            <dl className="divide-y divide-border">
              {VERSION_KEYS.map((k) => (
                <Row key={k} label={t(`versions.${k}`)} value={info.versions[k]} mono />
              ))}
            </dl>
          </section>
        </div>

        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('gatt')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{mode === 'demo' ? t('demoGatt') : mode === 'watch' ? t('watchGatt') : t('gattHint')}</p>
          </div>
          {mode === 'ble' && (!gatt || gatt.services.length === 0) && <p className="text-sm text-discharge">{t('noServices')}</p>}
          {gatt?.services.map((s) => (
            <div key={s.uuid} className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="font-mono text-xs break-all">{s.uuid}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {s.characteristics.map((c) => {
                  const inUse = gatt.selected?.service === s.uuid && gatt.selected.characteristic === c.uuid;
                  const usable = (c.properties.includes('write') || c.properties.includes('writeWithoutResponse')) && (c.properties.includes('notify') || c.properties.includes('indicate'));
                  return (
                    <li key={c.uuid} className={cn('flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5', inUse && 'bg-charge/10')}>
                      <span className="font-mono text-[11px] break-all">{c.uuid}</span>
                      <span className="flex flex-wrap gap-1">
                        {c.properties.map((p) => (
                          <Badge key={p} tone={p === 'notify' ? 'charge' : p.startsWith('write') ? 'ac' : 'neutral'}>
                            {p}
                          </Badge>
                        ))}
                      </span>
                      <span className="ms-auto">
                        {inUse ? (
                          <Badge tone="charge">{t('inUse')}</Badge>
                        ) : (
                          usable && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                deviceConnection.selectCharacteristic(s.uuid, c.uuid).catch((e: Error) => toast.error(e.message))
                              }
                            >
                              {t('use')}
                            </Button>
                          )
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
