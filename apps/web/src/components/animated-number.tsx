'use client';

import { useEffect, useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useSpring } from 'framer-motion';

/** A number that tweens smoothly to each new value (instant with prefers-reduced-motion). */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number | null | undefined;
  format: (v: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const spring = useSpring(value ?? 0, { stiffness: 90, damping: 22, mass: 0.7 });
  const [shown, setShown] = useState<number | null>(value ?? null);

  useEffect(() => {
    if (value === null || value === undefined) {
      setShown(null);
      return;
    }
    if (reduce) {
      spring.jump(value);
      setShown(value);
    } else {
      spring.set(value);
    }
  }, [value, reduce, spring]);

  useMotionValueEvent(spring, 'change', (v) => setShown(v));

  return <span className={className}>{shown === null || value === null || value === undefined ? '—' : format(shown)}</span>;
}
