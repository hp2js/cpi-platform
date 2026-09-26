import { useEffect } from 'react';

/**
 * Screens with unsaved input register here. While any are registered, an expired session does
 * not navigate away: the screen keeps the input and explains how to sign in again (PRD §11, §13.3).
 */
const holders = new Set<symbol>();

export function useUnsavedWork(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const key = Symbol('unsaved-work');
    holders.add(key);
    return () => {
      holders.delete(key);
    };
  }, [active]);
}

export function hasUnsavedWork() {
  return holders.size > 0;
}
