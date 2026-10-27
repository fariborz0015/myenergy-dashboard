import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-xl bg-muted/70 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.07),transparent)]',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
