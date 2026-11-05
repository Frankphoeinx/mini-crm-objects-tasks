import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  ApiError,
  useDeleteTask,
  useMe,
  useObjects,
  useProfiles,
  userMessage,
  useTask,
  type BoardTask,
  type ObjectRow,
  type Profile,
} from '@/shared/api';
import { isReturned, paths, readTaskFrom, usePageTitle } from '@/shared/lib';
import { DeleteDialog, Icon, NotFoundToObjects, QueriesState, ReturnedChip, RichTextEditor, RichTextView } from '@/shared/ui';
import { EditLine } from './EditLine';
import { StatusRoute } from './StatusRoute';
import { TaskActions } from './TaskActions';
import { TaskHistory } from './TaskHistory';
import { TaskPeople } from './TaskPeople';
import { useSaveTask } from './useSaveTask';

/** Карточка задачи (/tasks/:id). Показывает только доступное, права держит база. */
export function TaskPage({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const profiles = useProfiles();
  const objects = useObjects();

  const notFound = <NotFoundToObjects />;
  // Адрес с id не того вида база отвергает ошибкой, но для человека задачи просто нет.
  if (task.error instanceof ApiError && task.error.kind === 'not-found') return notFound;

  return (
    <QueriesState queries={[task, profiles, objects]} notFound={notFound}>
      {(row, people, places) => <TaskCard task={row} profiles={people} objects={places} />}
    </QueriesState>
  );
}

type TaskCardProps = { task: BoardTask; profiles: Profile[]; objects: ObjectRow[] };

function TaskCard({ task, profiles, objects }: TaskCardProps) {
  usePageTitle(task.title);
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const { save } = useSaveTask(task.id);
  const remove = useDeleteTask();
  const [deleting, setDeleting] = useState(false);

  // Объект берём из задачи, а не с момента открытия: после смены объекта назад ведёт уже на новый.
  const from = readTaskFrom(location.state);
  const back =
    from === 'my'
      ? { path: paths.my, label: 'Мои задачи' }
      : from === 'review'
        ? { path: paths.review, label: 'Ждут проверки' }
        : { path: paths.object(task.object_id), label: objects.find((o) => o.id === task.object_id)?.name ?? 'Объект' };

  const titleTransition = { viewTransitionName: `floor-${task.id}` };

  return (
    <section className="tk">
      <div className="tk-main">
        <div className="tile tk-title w">
          <span className="fx" aria-hidden="true"></span>
          <div className="tk-bar">
            <Link className="back" to={back.path}>
              <Icon name="back" />
              {back.label}
            </Link>
            {isReturned(task) && <ReturnedChip />}
            {me.isManager && (
              <div className="tk-manage">
                <button
                  className="ibtn is-danger"
                  type="button"
                  aria-label="Удалить задачу"
                  title="Удалить задачу"
                  onClick={() => setDeleting(true)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            )}
          </div>
          {me.isManager ? (
            <>
              <h1 className="sr">{task.title}</h1>
              {/* maxLength: те же пределы, что в базе, чтобы длинный текст не пропал после отказа. */}
              <EditLine
                className="edit-line h1 is-task"
                aria-label="Название задачи"
                style={titleTransition}
                maxLength={200}
                required
                oneLine
                value={task.title}
                onSave={(title) => save({ title })}
              />
              <RichTextEditor
                key={task.id}
                ariaLabel="Описание задачи"
                placeholder="Добавьте описание"
                value={task.description}
                onSave={(description) => save({ description })}
              />
            </>
          ) : (
            <>
              <h1 className="h1 is-task vt" style={titleTransition}>
                {task.title}
              </h1>
              <RichTextView value={task.description} />
            </>
          )}
        </div>

        <TaskHistory taskId={task.id} profiles={profiles} />
        <StatusRoute taskId={task.id} status={task.status} />
      </div>

      <div className="tk-side">
        <TaskActions task={task} profiles={profiles} />
        <TaskPeople task={task} profiles={profiles} objects={objects} />
      </div>

      {deleting && (
        <DeleteDialog
          title={`Удалить задачу «${task.title}»?`}
          text="Задача исчезнет у постановщиков и исполнителя. История останется в базе."
          busy={remove.isPending}
          error={remove.error ? userMessage(remove.error) : undefined}
          onConfirm={() => remove.mutate(task.id, { onSuccess: () => void navigate(back.path, { replace: true }) })}
          onClose={() => {
            setDeleting(false);
            remove.reset();
          }}
        />
      )}
    </section>
  );
}
