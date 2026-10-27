'use client';

import * as React from 'react';
import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Single-choice segmented control (arrow-key navigation via Radix ToggleGroup). */
function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  disabled,
  ariaLabel,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn('inline-flex w-full items-center gap-1 rounded-xl bg-muted/70 p-1', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=on]:bg-card-solid data-[state=on]:text-foreground data-[state=on]:shadow-sm sm:text-sm"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export { Segmented };
