'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { displayName, useDevice } from '@/lib/store/device-store';

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const tone =
    status === 'connected'
      ? 'bg-charge'
      : status === 'reconnecting' || status === 'connecting' || status === 'requesting'
        ? 'bg-discharge'
        : status === 'error' || status === 'disconnected'
          ? 'bg-danger'
          : 'bg-muted-foreground/50';
  return (
    <span className={cn('relative inline-flex size-2.5', className)} aria-hidden>
      {(status === 'connected' || status === 'reconnecting' || status === 'connecting') && (
        <span className={cn('absolute inset-0 rounded-full animate-pulse-ring', tone)} />
      )}
      <span className={cn('relative inline-flex size-2.5 rounded-full', tone)} />
    </span>
  );
}

export function ConnectionPill() {
  const t = useTranslations('status');
  const status = useDevice((s) => s.status);
  const mode = useDevice((s) => s.mode);
  const attempt = useDevice((s) => s.reconnectAttempt);
  const info = useDevice((s) => s.info);
  const label =
    status === 'connected' ? displayName(info) : status === 'reconnecting' ? t('reconnecting', { attempt }) : t(status);

  return (
    <Link
      href={status === 'connected' ? '/dashboard' : '/'}
      className="glass flex h-9 max-w-[52vw] items-center gap-2 rounded-full ps-3 pe-3 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:max-w-none"
      aria-live="polite"
    >
      <StatusDot status={status} />
      <span className="truncate">{label}</span>
      {status === 'connected' && mode && (
        <span className="hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase sm:inline">
          {t(mode)}
        </span>
      )}
    </Link>
  );
}
