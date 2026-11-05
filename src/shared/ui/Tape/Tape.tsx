import type { CSSProperties } from 'react';
import { Icon } from '../Icons';

/** Рулетка: лента выезжает на долю value (0–1). Только рисунок: число подписывает плитка рядом. */
export function Tape({ value, small = true }: { value: number; small?: boolean }) {
  return (
    <span className={small ? 'tape is-sm' : 'tape'} style={{ '--p': value } as CSSProperties} aria-hidden="true">
      <span className="tape-case">
        <Icon name="dial" />
      </span>
      <span className="tape-track">
        <span className="tape-blade"></span>
      </span>
    </span>
  );
}
