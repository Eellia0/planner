import { useEffect, useState } from 'react';

/** Цвет из CSS-переменной темы; пересчитывается при смене светлой/тёмной темы системы. */
export function useThemeColor(name: string, fallback: string): string {
  const read = () => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const [color, setColor] = useState(read);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setColor(read());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });
  return color;
}
