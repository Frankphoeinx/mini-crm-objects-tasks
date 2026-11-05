import type { CSSProperties } from 'react';
import { digits } from '../../lib/format';

/** Число с прокруткой цифр и подписью для диктора. suffix: знак после числа, например «%». */
export function Roll({ value, suffix = '' }: { value: number; suffix?: string }) {
  return (
    <>
      <span className="roll" aria-hidden="true">
        {digits(value).map((n, i) => (
          <span key={i} className="dg" style={{ '--n': n } as CSSProperties}></span>
        ))}
      </span>
      {suffix && <span aria-hidden="true">{suffix}</span>}
      <span className="sr">{`${value}${suffix}`}</span>
    </>
  );
}
