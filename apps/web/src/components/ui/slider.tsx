'use client';

import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Slider({ className, thumbLabel, ...props }: React.ComponentProps<typeof SliderPrimitive.Root> & { thumbLabel?: string }) {
  const values = props.value ?? props.defaultValue ?? [0];
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn('relative flex w-full touch-none items-center py-2 select-none data-[disabled]:opacity-50', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-track">
        <SliderPrimitive.Range className="absolute h-full bg-[linear-gradient(90deg,var(--ac),var(--charge))]" />
      </SliderPrimitive.Track>
      {values.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={thumbLabel}
          className="block size-5 rounded-full border-2 border-white bg-ac shadow-lg transition-[box-shadow] outline-none hover:ring-4 hover:ring-ac/20 focus-visible:ring-4 focus-visible:ring-ac/40"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
