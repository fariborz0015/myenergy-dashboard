'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const useInstall = create<{ prompt: BeforeInstallPromptEvent | null; set: (p: BeforeInstallPromptEvent | null) => void }>()((set) => ({
  prompt: null,
  set: (prompt) => set({ prompt }),
}));

/** Registers the service worker (production only) and remembers Chrome's install prompt. */
export function PwaRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[myenergy] service worker', e));
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      useInstall.getState().set(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => useInstall.getState().set(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}

/** "Install app" button, shown only when Chrome says the app can be installed. */
export function InstallButton() {
  const t = useTranslations('nav');
  const prompt = useInstall((s) => s.prompt);
  if (!prompt) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-full"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            useInstall.getState().set(null);
          }}
        >
          <Download />
          <span className="hidden sm:inline">{t('install')}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('installHint')}</TooltipContent>
    </Tooltip>
  );
}
