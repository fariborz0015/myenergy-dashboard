import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted/60 text-muted-foreground',
        charge: 'border-charge/25 bg-charge/10 text-charge',
        discharge: 'border-discharge/25 bg-discharge/10 text-discharge',
        ac: 'border-ac/25 bg-ac/10 text-ac',
        dc: 'border-dc/25 bg-dc/10 text-dc',
        danger: 'border-danger/30 bg-danger/10 text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

function Badge({ className, tone, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge };
