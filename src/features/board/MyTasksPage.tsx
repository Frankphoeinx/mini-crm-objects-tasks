import { useNavigate } from 'react-router';
import { useMe, useMyTasks, useMyTurnCount, useObjects, useReviewTasks, type BoardTask, type ObjectRow } from '@/shared/api';
import { delay, paths } from '@/shared/lib';
import { EmptyState, Icon, QueryState, ReviewTile, Roll } from '@/shared/ui';
import { Board } from './Board';

function MyTasks({ tasks, objects }: { tasks: BoardTask[]; objects: ObjectRow[] }) {
  const me = useMe();
  const navigate = useNavigate();
  const turn = useMyTurnCount();
  const waiting = useReviewTasks().data?.length ?? 0;

  return (
    <>
      <section className="hero is-mine">
        <div className="tile hero-title w">
          <h1 className="h1">Мои задачи</h1>
          <div className="hero-sub">
            <p className="addr">
              <span>
                {me.full_name}, {me.roleLabel}
              </span>
            </p>
            <div className="chips">
              <span className="chip">
                <Icon name="new" />
                <span>Всего: {tasks.length}</span>
              </span>
            </div>
          </div>
        </div>
        <ReviewTile hero waiting={waiting} />
        <div className="hero-side">
          <div className="tile t-orange w" style={delay('50ms')}>
            <span className="lbl">Ваш ход</span>
            <span className="turn-n">
              <Roll value={turn} />
            </span>
            <span className="lbl o-more">Ждут вашего действия</span>
          </div>
        </div>
      </section>
      {tasks.length === 0 ? (
        <EmptyState
          icon="work"
          title="Вам пока не назначили задач"
          text="Когда постановщик назначит вас на задачу, она появится здесь."
          action={
            <button className="btn is-primary" type="button" onClick={() => navigate(paths.objects)}>
              К объектам
            </button>
          }
        />
      ) : (
        <Board tasks={tasks} from="my" metaOf={(t) => ({ icon: 'pin', text: objects.find((o) => o.id === t.object_id)?.name ?? '' })} />
      )}
    </>
  );
}

export function MyTasksPage() {
  const tasks = useMyTasks();
  const objects = useObjects();

  return <QueryState query={tasks}>{(mine) => <QueryState query={objects}>{(places) => <MyTasks tasks={mine} objects={places} />}</QueryState>}</QueryState>;
}
