import { useEffect, useState } from 'react';

/** How long a panel takes to slide in or out; matches `duration-300` on the animated parts. */
export const PRESENCE_MS = 300;

/**
 * Keeps a panel mounted while it animates out, and mounts it hidden before animating it in.
 * `shown` drives the transition classes; `mounted` decides whether it renders at all, so a
 * closed panel takes no space and nothing in it can be focused. With reduced motion the CSS
 * transitions are instant and the panel simply appears and goes.
 */
export function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Render once hidden, then show, so the browser has a start state to transition from.
      const frame = window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => setShown(true)),
      );
      return () => window.cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), PRESENCE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);
  return { mounted, shown };
}
