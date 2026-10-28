'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Bluetooth, Calculator, History, LayoutDashboard, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionPill } from './connection-pill';
import { Logo } from './logo';
import { InstallButton } from './pwa';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { href: '/', key: 'home', icon: Bluetooth },
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { href: '/planner', key: 'planner', icon: Calculator },
  { href: '/history', key: 'history', icon: History },
  { href: '/settings', key: 'settings', icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="relative flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-popover px-3 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t('skip')}
      </a>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
            <Logo />
          </Link>

          <nav aria-label={t('main')} className="ms-6 hidden items-center gap-1 md:flex">
            {NAV.slice(1).map(({ href, key, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? 'page' : undefined}
                className={cn(
                  'relative flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  active(href) && 'text-foreground',
                )}
              >
                {active(href) && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-10 rounded-xl bg-accent"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className="size-4" />
                {t(key)}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <InstallButton />
            <ConnectionPill />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-12">
        {children}
      </main>

      {/* Phone tab bar */}
      <nav
        aria-label={t('main')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map(({ href, key, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active(href) ? 'page' : undefined}
                className={cn(
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground outline-none focus-visible:bg-accent',
                  active(href) && 'text-foreground',
                )}
              >
                {active(href) && (
                  <motion.span
                    layoutId="tab-active"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-[linear-gradient(90deg,var(--ac),var(--charge))]"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className={cn('size-5', active(href) && 'text-ac')} />
                {t(key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
