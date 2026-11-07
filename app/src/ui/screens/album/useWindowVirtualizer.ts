import { useEffect, useMemo, useState, type RefObject } from 'react';

/** Rows rendered above and below the viewport. */
const OVERSCAN_PX = 600;

/**
 * Window-scroll virtualisation for a list of variable-height rows.
 * Returns the visible index range and each row's offset.
 */
export function useWindowVirtualizer(
  containerRef: RefObject<HTMLElement | null>,
  heights: readonly number[],
) {
  const offsets = useMemo(() => {
    const result = new Array<number>(heights.length + 1);
    result[0] = 0;
    heights.forEach((h, i) => (result[i + 1] = (result[i] ?? 0) + h));
    return result;
  }, [heights]);
  const total = offsets[heights.length] ?? 0;
  const [range, setRange] = useState({ start: 0, end: Math.min(heights.length, 20) });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = container.getBoundingClientRect().top;
      const from = -top - OVERSCAN_PX;
      const to = -top + window.innerHeight + OVERSCAN_PX;
      let start = 0;
      while (start < heights.length && (offsets[start + 1] ?? 0) < from) start++;
      let end = start;
      while (end < heights.length && (offsets[end] ?? 0) < to) end++;
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [containerRef, heights, offsets]);

  return { range, offsets, total };
}

/** Width of an element, kept up to date. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
