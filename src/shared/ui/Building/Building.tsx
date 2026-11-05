import type { CSSProperties } from 'react';
import { Icon } from '../Icons';

const MAX_FLOORS = 24;

export type Floor = { full: boolean; ghost: boolean; flash: boolean; delay: string };

/** Этажи считаем снизу: заполнено столько, сколько принято. Без задач три пустых этажа. Больше 24 рисуем пропорционально. */
export function floorsOf(total: number, accepted: number, flash = false): Floor[] {
  if (!total) return Array.from({ length: 3 }, () => ({ full: false, ghost: true, flash: false, delay: '0ms' }));
  const count = Math.min(total, MAX_FLOORS);
  const fullCount = Math.round((accepted / total) * count);
  return Array.from({ length: count }, (_, i) => ({
    full: i < fullCount,
    ghost: false,
    flash: flash && i === fullCount - 1,
    delay: flash ? '0ms' : `${Math.min(i * 30, 150)}ms`,
  }));
}

function floorClass(floor: Floor) {
  return ['fl', floor.full && 'is-full', floor.ghost && 'is-ghost', floor.flash && 'is-flash'].filter(Boolean).join(' ');
}

/**
 * Здание и леса. Кладётся внутрь .obj-art или .ready-b (там же .earth).
 * flash: только что принята задача, верхний заполненный этаж вспыхивает.
 */
export function Building({
  total,
  accepted,
  flash = false,
  viewTransitionName,
}: {
  total: number;
  accepted: number;
  flash?: boolean;
  viewTransitionName?: string;
}) {
  return (
    <>
      <span className="bld" style={{ viewTransitionName }}>
        {floorsOf(total, accepted, flash).map((floor, i) => (
          <span key={i} className={floorClass(floor)} style={{ '--d': floor.delay } as CSSProperties}>
            <i className="fl-fill"></i>
            {floor.flash && <Icon name="accepted" className="fl-ok" />}
          </span>
        ))}
        <span className="bld-roof"></span>
      </span>
      <svg className="scaf" viewBox="0 0 48 120" preserveAspectRatio="none" aria-hidden="true">
        <use href="#scaf"></use>
      </svg>
    </>
  );
}
