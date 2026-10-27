import { useTranslations } from 'next-intl';

export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <span
      className={`relative grid place-items-center rounded-xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--ac)_25%,transparent),color-mix(in_oklab,var(--charge)_25%,transparent))] ring-1 ring-white/10 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <defs>
          <linearGradient id="logo-bolt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ac)" />
            <stop offset="1" stopColor="var(--charge)" />
          </linearGradient>
        </defs>
        <path d="M13.5 2 5 13.5h6l-1.5 8.5L19 10h-6.5z" fill="url(#logo-bolt)" />
      </svg>
    </span>
  );
}

export function Logo() {
  const t = useTranslations('app');
  return (
    <>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">{t('name')}</span>
    </>
  );
}
