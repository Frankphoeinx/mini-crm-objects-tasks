import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, useDeleteObject, useMe, useObject, useObjectTasks, userMessage, type BoardTask, type ObjectRow } from '@/shared/api';
import { delay, movesFor, paths, plural } from '@/shared/lib';
import { DeleteDialog, Icon, NotFoundState, QueryState, ReviewTile, Roll, useMoveFlash } from '@/shared/ui';
import { ObjectDialog } from './ObjectDialog';
import { objectStats, ReadyTile } from './SummaryTiles';

function DeleteObjectDialog({ object, tasks, onClose }: { object: ObjectRow; tasks: BoardTask[]; onClose: () => void }) {
  const navigate = useNavigate();
  const remove = useDeleteObject();
  return (
    <DeleteDialog
      title={`Удалить объект «${object.name}»?`}
      text={
        tasks.length
          ? `Вместе с объектом скроются ${plural(tasks.length, 'задача', 'задачи', 'задач')}. Исполнители перестанут их видеть. История останется в базе.`
          : 'Задач на объекте нет. Он исчезнет из списка.'
      }
      items={tasks}
      busy={remove.isPending}
      error={remove.error ? userMessage(remove.error) : undefined}
      onConfirm={() => remove.mutate(object.id, { onSuccess: () => navigate(paths.objects) })}
      onClose={onClose}
    />
  );
}

function ObjectHero({ object }: { object: ObjectRow }) {
  const me = useMe();
  const navigate = useNavigate();
  const { data: tasks } = useObjectTasks(object.id);
  const { to } = useMoveFlash();
  const [editing, setEditing] = useState(false);
  // Список запоминаем при открытии окна: удаление сразу убирает задачи из кэша, текст окна не должен смениться на «задач нет».
  const [deleting, setDeleting] = useState<BoardTask[] | null>(null);
  // Загрузку и ошибку задач показывает доска. До ответа цифр нет: ложные нули хуже их отсутствия.
  const stats = tasks && objectStats(tasks);
  const turn = tasks?.filter((t) => movesFor(t, me).length > 0).length ?? 0;

  return (
    <section className={me.isManager ? 'hero is-boss' : 'hero'}>
      <div className="tile hero-title w">
        <div className="tk-bar">
          <button className="back" type="button" onClick={() => navigate(paths.objects)}>
            <Icon name="back" />
            Все объекты
          </button>
          {me.isManager && (
            <div className="tk-manage">
              <button className="ibtn" type="button" aria-label="Изменить объект" title="Изменить объект" onClick={() => setEditing(true)}>
                <Icon name="pen" />
              </button>
              <button
                className="ibtn is-danger"
                type="button"
                aria-label="Удалить объект"
                title="Удалить объект"
                disabled={!tasks}
                onClick={() => setDeleting(tasks ?? null)}
              >
                <Icon name="trash" />
              </button>
            </div>
          )}
        </div>
        <h1 className="h1 vt" style={{ viewTransitionName: `tower-${object.id}` }}>
          {object.name}
        </h1>
        <div className="hero-sub">
          <p className="addr">
            <Icon name="pin" />
            {object.address}
          </p>
          {stats && (
            <div className="chips">
              <span className="chip">
                <Icon name="new" />
                {plural(stats.count, 'задача', 'задачи', 'задач')}
              </span>
              {stats.hasRework && (
                <span className="chip st-rework">
                  <Icon name="rework" />
                  На доработке
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {stats && (
        <>
          <ReviewTile hero waiting={stats.waiting} />
          <ReadyTile hero total={stats.count} accepted={stats.accepted} flash={to === 'accepted'} viewTransitionName={`bld-${object.id}`} />
          {!me.isManager && (
            <div className="hero-side">
              <div className="tile t-orange w" style={delay('75ms')}>
                <span className="lbl">Ваш ход</span>
                <span className="turn-n">
                  <Roll value={turn} />
                </span>
                <span className="lbl o-more">Ждут вашего действия</span>
              </div>
            </div>
          )}
        </>
      )}
      {editing && <ObjectDialog object={object} onClose={() => setEditing(false)} />}
      {deleting && <DeleteObjectDialog object={object} tasks={deleting} onClose={() => setDeleting(null)} />}
    </section>
  );
}

/** Страница объекта: шапка, затем доска из board. key={objectId} ставит роутер. */
export function ObjectPage({ objectId, board }: { objectId: string; board: ReactNode }) {
  const object = useObject(objectId);
  const navigate = useNavigate();
  const notFound = (
    <NotFoundState
      action={
        <button className="btn is-primary" type="button" onClick={() => navigate(paths.objects)}>
          Все объекты
        </button>
      }
    />
  );
  // Адрес с неверным id база отклоняет ошибкой: для человека это то же «не найдено», повтор не поможет.
  if (object.error instanceof ApiError && object.error.kind === 'not-found') return notFound;
  return (
    <QueryState query={object} notFound={notFound}>
      {(row) => (
        <>
          <ObjectHero object={row} />
          {board}
        </>
      )}
    </QueryState>
  );
}
