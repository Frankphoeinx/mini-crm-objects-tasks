import { Link } from 'react-router';
import { useMe, useMyTasks, useMyTurnCount, useObjects, useProfiles, useReviewTasks, type BoardTask, type ObjectRow } from '@/shared/api';
import { paths, usePageTitle } from '@/shared/lib';
import { EmptyState, Icon, QueriesState, ReviewTile, TurnTile } from '@/shared/ui';
import { Board } from './Board';

function MyTasks({ tasks, objects }: { tasks: BoardTask[]; objects: ObjectRow[] }) {
  const me = useMe();
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
          <TurnTile turn={turn} />
        </div>
      </section>
      {tasks.length === 0 ? (
        <EmptyState
          icon="work"
          title="Вам пока не назначили задач"
          text="Когда постановщик назначит вас на задачу, она появится здесь."
          action={
            <Link className="btn is-primary" to={paths.objects}>
              К объектам
            </Link>
          }
        />
      ) : (
        <Board tasks={tasks} from="my" metaOf={(t) => ({ icon: 'pin', text: objects.find((o) => o.id === t.object_id)?.name ?? '' })} />
      )}
    </>
  );
}

export function MyTasksPage() {
  usePageTitle('Мои задачи');
  const tasks = useMyTasks();
  const objects = useObjects();
  // Здесь имена не нужны, но без них первое открытие задачи покажет загрузку вместо полёта заголовка.
  useProfiles();

  return <QueriesState queries={[tasks, objects]}>{(mine, places) => <MyTasks tasks={mine} objects={places} />}</QueriesState>;
}
