'use client';

import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

type Tone = 'charge' | 'ac' | 'dc' | 'usb' | 'discharge';

const TONES: Record<Tone, string> = {
  charge: 'data-[state=checked]:bg-charge',
  ac: 'data-[state=checked]:bg-ac',
  dc: 'data-[state=checked]:bg-dc',
  usb: 'data-[state=checked]:bg-usb',
  discharge: 'data-[state=checked]:bg-discharge',
};

/** `tone` colours the "on" track with one of the energy colours. */
function Switch({ className, tone = 'charge', ...props }: React.ComponentProps<typeof SwitchPrimitive.Root> & { tone?: Tone }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:bg-track',
        TONES[tone],
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-6 rounded-full bg-white shadow-md ring-0 transition-transform data-[state=checked]:translate-x-[21px] data-[state=unchecked]:translate-x-px rtl:data-[state=checked]:-translate-x-[21px] rtl:data-[state=unchecked]:-translate-x-px" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
