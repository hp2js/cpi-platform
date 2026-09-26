import { delay } from 'msw';

export type LatencyMode = 'off' | 'realistic' | 'slow';
const KEY = 'cpi-mock-latency';

export function getLatencyMode(): LatencyMode {
  try {
    const value =
      typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    return value === 'off' || value === 'slow'
      ? value
      : typeof window === 'undefined'
        ? 'off'
        : 'realistic';
  } catch {
    return 'off';
  }
}
export function setLatencyMode(mode: LatencyMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Simulated network time so loading states are visible during development. */
export async function networkDelay() {
  const mode = getLatencyMode();
  if (mode === 'off') return;
  await delay(
    mode === 'slow' ? 1500 + Math.random() * 1000 : 120 + Math.random() * 280,
  );
}
