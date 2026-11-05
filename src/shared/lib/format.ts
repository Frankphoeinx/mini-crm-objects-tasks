import type { CSSProperties } from 'react';

/** Задержка волны появления (.w). */
export const delay = (d: string) => ({ '--d': d }) as CSSProperties;

/** plural(3, 'задача', 'задачи', 'задач') даёт «3 задачи». */
export function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return `${n} ${one}`;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function digits(n: number) {
  return String(n).split('').map(Number);
}

export function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

/** Доля 0–1 для рулетки. */
export function ratio(part: number, total: number) {
  return total ? part / total : 0;
}

/** Задержка волны появления: шаг 25 мс, вся волна до 150 мс. */
export function waveDelay(i: number) {
  return `${Math.min(i * 25, 150)}ms`;
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** «3 ноября, 09:10», за сегодня «сегодня, 09:10». */
export function formatDateTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  const day = date.toDateString() === now.toDateString() ? 'сегодня' : dayFormat.format(date);
  return `${day}, ${timeFormat.format(date)}`;
}
