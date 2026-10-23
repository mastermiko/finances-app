import { useEffect } from 'react';

/**
 * Lightweight User Timing marks around hot paths (filtering, dashboard figures,
 * exports). Visible in the browser performance panel and read by the volume tests.
 */
export function measure<T>(name: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    try {
      performance.measure(name, { start, end: performance.now() });
    } catch {
      // User Timing unavailable: ignore
    }
  }
}

/**
 * Measures each render of a component up to its commit (passive effect), under
 * `name`. Used on the dashboard: computing and rendering every card.
 */
export function useRenderMeasure(name: string): void {
  const start = performance.now();
  useEffect(() => {
    try {
      performance.measure(name, { start, end: performance.now() });
    } catch {
      // User Timing unavailable: ignore
    }
  });
}
