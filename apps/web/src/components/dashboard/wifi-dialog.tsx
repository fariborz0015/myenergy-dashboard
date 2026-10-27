'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Eye, EyeOff, LoaderCircle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deviceConnection } from '@/lib/device/connection';
import { useDevice } from '@/lib/store/device-store';

export function WifiDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('wifi');
  const tc = useTranslations('common');
  const reply = useDevice((s) => s.wifiReply);
  const readOnly = useDevice((s) => s.mode === 'watch' || s.status !== 'connected');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ssid) return;
    setBusy(true);
    try {
      await deviceConnection.provisionWifi(ssid, password);
      toast.success(t('done'));
      setPassword('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('close')}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-xl border border-discharge/30 bg-discharge/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-discharge" />
          <p>{t('warning')}</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4" autoComplete="off">
          <div className="flex flex-col gap-2">
            <Label htmlFor="wifi-ssid">{t('ssid')}</Label>
            <Input id="wifi-ssid" value={ssid} onChange={(e) => setSsid(e.target.value)} required maxLength={32} autoCapitalize="none" spellCheck={false} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wifi-password">{t('password')}</Label>
            <div className="relative">
              <Input
                id="wifi-password"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={64}
                className="pe-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t('hide') : t('show')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {reply && <p className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs break-all">{t('reply', { reply })}</p>}
          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => deviceConnection.queryWifi()}>
                {t('query')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={readOnly}
                onClick={() => deviceConnection.clearWifi().then(() => toast.success(t('cleared')))}
              >
                {t('clear')}
              </Button>
            </div>
            <Button type="submit" variant="energy" disabled={readOnly || busy || !ssid}>
              {busy && <LoaderCircle className="animate-spin" />}
              {busy ? t('sending') : t('send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
