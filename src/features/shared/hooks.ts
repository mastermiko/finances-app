import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const get = (): boolean =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (): void => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const WIDE_QUERY = '(min-width: 1024px)';

/** Debounced value (search input). */
export function useDebounced<T>(value: T, delay = 120): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Horizontal swipe on an element (month navigation). */
export function useSwipe(
  onLeft: () => void,
  onRight: () => void,
): {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
} {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'touch') setStart({ x: e.clientX, y: e.clientY });
    },
    onPointerUp: (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      setStart(null);
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) {
        if (dx < 0) onLeft();
        else onRight();
      }
    },
  };
}
