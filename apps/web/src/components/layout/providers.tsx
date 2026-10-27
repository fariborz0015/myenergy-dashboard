'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { useLocale } from 'next-intl';
import { Direction } from 'radix-ui';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DeviceRuntime } from './device-runtime';

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  return (
    <Toaster
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      position="top-center"
      dir={locale === 'fa' ? 'rtl' : 'ltr'}
      toastOptions={{
        classNames: {
          toast: '!rounded-2xl !border !border-border !bg-popover !text-popover-foreground !shadow-2xl',
          description: '!text-muted-foreground',
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <Direction.Provider dir={locale === 'fa' ? 'rtl' : 'ltr'}>
        <TooltipProvider delayDuration={300}>
          {children}
          <DeviceRuntime />
          <ThemedToaster />
        </TooltipProvider>
      </Direction.Provider>
    </ThemeProvider>
  );
}
