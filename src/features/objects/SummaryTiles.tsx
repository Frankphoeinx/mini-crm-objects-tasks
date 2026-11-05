import type { BoardTask } from '@/shared/api';
import { delay, percent, ratio } from '@/shared/lib';
import { Building, Roll, Tape } from '@/shared/ui';

export function objectStats(tasks: BoardTask[]) {
  return {
    count: tasks.length,
    accepted: tasks.filter((t) => t.status === 'accepted').length,
    waiting: tasks.filter((t) => t.status === 'review').length,
    hasRework: tasks.some((t) => t.status === 'rework'),
  };
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
