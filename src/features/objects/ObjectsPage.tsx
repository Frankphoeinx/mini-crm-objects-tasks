import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useBoardTasks, useMe, useMyTurnCount, useObjects, type BoardTask, type ObjectRow } from '@/shared/api';
import { delay, paths, percent, plural, ratio, waveDelay } from '@/shared/lib';
import { Building, Icon, QueryState, ReviewTile, Roll, Tape } from '@/shared/ui';
import { ObjectDialog } from './ObjectDialog';
import { objectStats, ReadyTile } from './SummaryTiles';

function ObjectTile({ object, tasks, index }: { object: ObjectRow; tasks: BoardTask[]; index: number }) {
  const navigate = useNavigate();
  const { count, accepted, waiting, hasRework } = objectStats(tasks);
  return (
    <button className="tile obj lift w" type="button" style={delay(waveDelay(index + 2))} onClick={() => navigate(paths.object(object.id))}>
      <span className="art-clip" aria-hidden="true">
        <span className="earth"></span>
        <span className="obj-art art">
          <Building total={count} accepted={accepted} viewTransitionName={`bld-${object.id}`} />
        </span>
      </span>
      <span className="obj-name vt" style={{ viewTransitionName: `tower-${object.id}` }}>
        {object.name}
      </span>
      <span className="obj-addr">{object.address}</span>
      <span className="chips">
        <span className="chip">
          <Icon name="new" />
          {plural(count, 'задача', 'задачи', 'задач')}
        </span>
        {waiting > 0 && (
          <span className="chip">
            <Icon name="review" />
            {plural(waiting, 'ждёт проверки', 'ждут проверки', 'ждут проверки')}
          </span>
        )}
        {hasRework && (
          <span className="chip st-rework">
            <Icon name="rework" />
            На доработке
          </span>
        )}
      </span>
      <span className="obj-foot">
        <span className="obj-pct">{percent(accepted, count)}%</span>
        <span className="lbl">
          Принято {accepted} из {count}
        </span>
        <Tape value={ratio(accepted, count)} />
      </span>
    </button>
  );
}

function ObjectsContent({ objects, tasks }: { objects: ObjectRow[]; tasks: BoardTask[] }) {
  const me = useMe();
  const navigate = useNavigate();
  const turn = useMyTurnCount();
  const [adding, setAdding] = useState(false);
  const summary = objectStats(tasks);

  return (
    <>
      <div className="sum">
        {!me.isManager && (
          <button className="tile t-orange lift w" type="button" onClick={() => navigate(paths.my)}>
            <span className="lbl">Ваш ход</span>
            <span className="turn-n">
              <Roll value={turn} />
            </span>
            <span className="o-title o-more" style={{ marginTop: 0 }}>
              Открыть мои задачи
            </span>
          </button>
        )}
        <ReviewTile waiting={summary.waiting} />
        <ReadyTile total={summary.count} accepted={summary.accepted} />
        {me.isManager && (
          <button className="tile t-orange lift w" type="button" style={delay('75ms')} onClick={() => setAdding(true)}>
            <span className="art-clip" aria-hidden="true">
              <svg className="bricks art" viewBox="0 0 260 144" preserveAspectRatio="xMaxYMax slice">
                <use href="#bricks"></use>
              </svg>
            </span>
            <span className="plus">
              <Icon name="plus" className="ic-l" />
            </span>
            <span className="o-title is-big">Добавить объект</span>
          </button>
        )}
      </div>

      <div className="objs-grid">
        {objects.length === 0 && (
          <div className="tile empty objs-empty w" style={delay('50ms')}>
            <Icon name="crane" className="ic-xl" />
            <h2 className="tile-h">Объектов пока нет</h2>
            <p>{me.isManager ? 'Добавьте первый объект, и здесь вырастет его здание.' : 'Вас пока не назначили ни на один объект.'}</p>
          </div>
        )}
        {objects.map((object, i) => (
          <ObjectTile key={object.id} object={object} index={i} tasks={tasks.filter((t) => t.object_id === object.id)} />
        ))}
      </div>

      {adding && <ObjectDialog onClose={() => setAdding(false)} />}
    </>
  );
}

export function ObjectsPage() {
  const objects = useObjects();
  const tasks = useBoardTasks();
  return (
    <section className="objs">
      <h1 className="page-h w">Объекты</h1>
      <QueryState query={objects}>
        {(objectRows) => <QueryState query={tasks}>{(taskRows) => <ObjectsContent objects={objectRows} tasks={taskRows} />}</QueryState>}
      </QueryState>
    </section>
  );
}
