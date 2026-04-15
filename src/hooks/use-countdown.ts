import { useState, useEffect, useRef } from 'react';
import { msUntil } from '@/src/utils/time';

interface CountdownResult {
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  isExpired: boolean;
}

/**
 * Returns a live countdown to a target ISO string.
 * Updates every second while active.
 */
export function useCountdown(targetIso: string | null): CountdownResult {
  const [totalMs, setTotalMs] = useState<number>(
    targetIso ? msUntil(new Date(targetIso)) : 0
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setTotalMs(0);
      return;
    }

    const tick = () => {
      const ms = msUntil(new Date(targetIso));
      setTotalMs(ms);
      if (ms === 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetIso]);

  const hours = Math.floor(totalMs / (1000 * 60 * 60));
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);

  return { hours, minutes, seconds, totalMs, isExpired: totalMs === 0 };
}
