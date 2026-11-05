import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import type { BoardTask } from '@/shared/api';
import { paths, percent, ratio } from '@/shared/lib';
import { Building, Crane, Roll, Tape } from '@/shared/ui';

export const delay = (d: string) => ({ '--d': d }) as CSSProperties;

export function objectStats(tasks: BoardTask[]) {
  return {
    count: tasks.length,
    accepted: tasks.filter((t) => t.status === 'accepted').length,
    waiting: tasks.filter((t) => t.status === 'review').length,
    hasRework: tasks.some((t) => t.status === 'rework'),
  };
}

/** Чёрный блок с краном: сводка списка объектов и шапка объекта (hero). */
export function ReviewTile({ waiting, hero = false }: { waiting: number; hero?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      className={hero ? 'tile t-crane hero-crane lift w' : 'tile t-crane lift w'}
      type="button"
      style={delay('25ms')}
      onClick={() => navigate(paths.review)}
    >
      <Crane />
      <span className="big-n">
        <Roll value={waiting} />
      </span>
      <span className="big-l">Ждут проверки</span>
    </button>
  );
}

type ReadyTileProps = {
  total: number;
  accepted: number;
  hero?: boolean;
  flash?: boolean;
  viewTransitionName?: string;
};

/** Плитка «Готовность»: здание, процент, рулетка. */
export function ReadyTile({ total, accepted, hero = false, flash, viewTransitionName }: ReadyTileProps) {
  return (
    <div className={hero ? 'tile ready hero-ready w' : 'tile ready s-ready w'} style={delay('50ms')}>
      <div className="ready-top">
        <div className="ready-b art">
          <span className="earth"></span>
          <Building total={total} accepted={accepted} flash={flash} viewTransitionName={viewTransitionName} />
        </div>
        <div className="ready-txt">
          <span className="lbl">Готовность</span>
          <span className="ready-n">
            <Roll value={percent(accepted, total)} suffix="%" />
          </span>
          <span className="lbl">
            Принято {accepted} из {total}
          </span>
        </div>
      </div>
      <Tape value={ratio(accepted, total)} />
    </div>
  );
}
