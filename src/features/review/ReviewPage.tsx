import { useNavigate } from 'react-router';
import { useMe, useObjects, useProfiles, useReviewTasks, type BoardTask, type ObjectRow, type Profile } from '@/shared/api';
import { delay, isReturned, movesFor, paths, shortName, taskLinkState, waveDelay } from '@/shared/lib';
import { Icon, MoveButtons, QueriesState, ReturnedChip, useRequestMove } from '@/shared/ui';

function ReviewList({ tasks, objects, profiles }: { tasks: BoardTask[]; objects: ObjectRow[]; profiles: Profile[] }) {
  const me = useMe();
  const navigate = useNavigate();
  const { requestMove, moveDialog } = useRequestMove();

  return (
    <>
      {tasks.length === 0 && (
        <div className="tile empty w" style={delay('25ms')}>
          <Icon name="review" className="ic-xl" />
          <h2 className="tile-h">Сейчас ничего не ждёт проверки</h2>
          <p>Когда исполнитель сдаст работу, задача появится здесь.</p>
        </div>
      )}
      <div className="rv-grid">
        {tasks.map((task, i) => {
          const returned = isReturned(task);
          const moves = movesFor(task, me);
          return (
            <article key={task.id} className={returned ? 'kcard w is-returned' : 'kcard w'} data-card={task.id} style={delay(waveDelay(i))}>
              <span className="kfx" aria-hidden="true"></span>
              <button className="kopen" type="button" onClick={() => navigate(paths.task(task.id), { state: taskLinkState('review') })}>
                <span className="vt" style={{ display: 'block', viewTransitionName: `floor-${task.id}` }}>
                  {task.title}
                </span>
              </button>
              {returned && <ReturnedChip />}
              <span className="kmeta">
                <Icon name="pin" />
                {objects.find((o) => o.id === task.object_id)?.name}
              </span>
              <span className="kmeta">
                <Icon name="work" />
                {shortName(profiles, task.assignee_id)}
              </span>
              {moves.length > 0 && <MoveButtons moves={moves} onMove={(move) => requestMove(task, move)} />}
            </article>
          );
        })}
      </div>
      {moveDialog}
    </>
  );
}

export function ReviewPage() {
  const navigate = useNavigate();
  const tasks = useReviewTasks();
  const objects = useObjects();
  const profiles = useProfiles();

  return (
    <section className="rv">
      <div className="rv-head">
        <button className="back" type="button" onClick={() => navigate(paths.objects)}>
          <Icon name="back" />
          Все объекты
        </button>
        <h1 className="h1">Ждут проверки</h1>
      </div>
      <QueriesState queries={[tasks, objects, profiles]}>{(taskRows, objectRows, people) => <ReviewList tasks={taskRows} objects={objectRows} profiles={people} />}</QueriesState>
    </section>
  );
}
