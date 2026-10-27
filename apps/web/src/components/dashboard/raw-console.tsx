'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Copy, Pause, Play, Terminal, Trash2, TriangleAlert } from 'lucide-react';
import { formatHex } from '@myenergy/protocol';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { useFmt } from '@/lib/format';
import { useDevice, type FrameEntry } from '@/lib/store/device-store';
import { cn } from '@/lib/utils';

function useCopy() {
  const [copied, setCopied] = useState<number | 'all' | null>(null);
  const copy = async (text: string, key: number | 'all') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      // clipboard blocked
    }
  };
  return { copied, copy };
}

export function RawConsole() {
  const t = useTranslations('console');
  const tc = useTranslations('common');
  const fmt = useFmt();
  const frames = useDevice((s) => s.frames);
  const paused = useDevice((s) => s.framesPaused);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'tx' | 'rx'>('all');
  const { copied, copy } = useCopy();

  const visible = useMemo(() => {
    const list = filter === 'all' ? frames : frames.filter((f) => f.dir === filter);
    return list.slice(-150).reverse();
  }, [frames, filter]);

  const line = (f: FrameEntry) => `${new Date(f.ts).toISOString()} ${f.dir.toUpperCase()} ${f.hex}  # ${f.summary}`;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="raw-console"
        className="flex w-full items-center gap-3 px-5 py-4 text-start outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:px-6"
      >
        <Terminal className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('title')}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular">{t('count', { count: frames.length })}</span>
        <ChevronDown className={cn('ms-auto size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="raw-console"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 sm:px-6">
              <Segmented
                ariaLabel={t('title')}
                className="w-auto"
                value={filter}
                onValueChange={setFilter}
                options={[
                  { value: 'all', label: t('all') },
                  { value: 'tx', label: t('tx') },
                  { value: 'rx', label: t('rx') },
                ]}
              />
              <div className="ms-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => useDevice.getState().setFramesPaused(!paused)}>
                  {paused ? <Play /> : <Pause />}
                  {paused ? t('resume') : t('pause')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => copy(frames.map(line).join('\n'), 'all')} disabled={!frames.length}>
                  {copied === 'all' ? <Check /> : <Copy />}
                  {copied === 'all' ? tc('copied') : t('copyAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => useDevice.getState().clearFrames()} disabled={!frames.length}>
                  <Trash2 />
                  {t('clear')}
                </Button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto px-2 pb-3 sm:px-3" dir="ltr">
              {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>}
              <ol className="flex flex-col gap-0.5 font-mono text-[11px] leading-relaxed">
                {visible.map((f) => (
                  <li key={f.id} className="group grid grid-cols-[auto_auto_1fr_auto] items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40">
                    <span className="text-muted-foreground tabular">{fmt.time(f.ts, true)}</span>
                    <span
                      className={cn(
                        'rounded px-1 text-[10px] font-semibold',
                        f.dir === 'tx' ? 'bg-ac/15 text-ac' : 'bg-charge/15 text-charge',
                      )}
                    >
                      {f.dir === 'tx' ? t('tx') : t('rx')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-sans text-xs text-foreground">
                        {f.crcOk === false && (
                          <span title={t('crcWarn')}>
                            <TriangleAlert className="size-3.5 text-discharge" aria-label={t('crcWarn')} />
                          </span>
                        )}
                        <span className="truncate">{f.summary}</span>
                      </div>
                      <div className="break-all text-muted-foreground">{formatHex(f.hex)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copy(f.hex, f.id)}
                      aria-label={tc('copy')}
                      className="rounded p-1 text-muted-foreground opacity-60 outline-none group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      {copied === f.id ? <Check className="size-3.5 text-charge" /> : <Copy className="size-3.5" />}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
