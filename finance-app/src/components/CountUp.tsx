import React, { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  format: (value: number) => string;
  /** Count up only the first time a given key is seen in this session. */
  id: string;
}

const animatedIds = new Set<string>();

/** Counts a KPI up from zero over 700ms (ease-out). Skipped on revisits and for reduced motion. */
export function CountUp({ value, format, id }: CountUpProps): React.ReactElement {
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const skip = reduceMotion || animatedIds.has(id) || value === 0;
  const [shown, setShown] = useState(skip ? value : 0);
  const frame = useRef(0);

  useEffect(() => {
    if (skip) {
      setShown(value);
      animatedIds.add(id);
      return undefined;
    }
    animatedIds.add(id);
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(value * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After the first run, always show the live value so later edits are never stale.
  const settled = skip || shown === value;
  return <>{format(settled ? value : shown)}</>;
}
