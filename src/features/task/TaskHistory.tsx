import { useTaskEvents, type Profile, type TaskEvent, type TaskStatus } from '@/shared/api';
import { delay, formatDateTime, fullName, plainText, STATUS_LABEL, waveDelay } from '@/shared/lib';
import { ErrorState, LoadingState } from '@/shared/ui';
import { useMoveFlash } from '@/shared/undo';

const statusText = (status: TaskStatus | null) => (status ? STATUS_LABEL[status] : '');

/** Заголовок записи истории понятным текстом. */
export function eventText(event: TaskEvent) {
  switch (event.kind) {
    case 'created':
      return 'Создана';
    case 'deleted':
      return 'Задача удалена';
    case 'status':
      return `${statusText(event.from_status)} → ${statusText(event.to_status)}`;
    case 'edit':
      if (event.field === 'title') return 'Название изменено';
      if (event.field === 'description') return 'Описание изменено';
      return `${event.field === 'object' ? 'Объект' : 'Исполнитель'}: ${event.old_value ?? '—'} → ${event.new_value ?? '—'}`;
  }
}

/** Что было и что стало показываем отдельно для длинных полей: остальное уже в заголовке записи. */
function EditDiff({ event }: { event: TaskEvent }) {
  if (event.field !== 'title' && event.field !== 'description') return null;
  if (!event.old_value && !event.new_value) return null;
  // Описание хранится в Markdown, а человеку нужен текст.
  const show = event.field === 'description' ? plainText : (text: string) => text;
  return (
    <p className="ev-cmt" style={{ whiteSpace: 'pre-wrap' }}>
      {event.old_value && `Было: ${show(event.old_value)}\n`}
      {event.new_value && `Стало: ${show(event.new_value)}`}
    </p>
  );
}

export function TaskHistory({ taskId, profiles }: { taskId: string; profiles: Profile[] }) {
  const events = useTaskEvents(taskId);
  const flash = useMoveFlash();

  // Плитка состояния сама рисует фон, а .tk-hist держит её на месте истории и на телефоне.
  if (!events.data) {
    return (
      <div className="tk-hist">
        {events.error ? (
          <ErrorState title="Не получилось загрузить историю" error={events.error} onRetry={() => void events.refetch()} />
        ) : (
          <LoadingState text="Загружаем историю…" />
        )}
      </div>
    );
  }

  const lastAt = events.data.length - 1;
  return (
    <section className="tile tk-hist w" style={delay('100ms')}>
      <h2 className="tile-h">История</h2>
      <ol className="tl">
        {events.data.map((event, i) => {
          const isNew = i === lastAt && flash.to !== null && flash.taskId === taskId;
          return (
            <li
              // История только дополняется. По номеру в списке: временная строка получит id из базы, но не появится заново.
              key={i}
              className={`ev w${event.kind === 'edit' ? ' is-edit' : ''}${isNew ? ' is-new' : ''}`}
              style={delay(isNew ? '0ms' : waveDelay(i))}
            >
              <span className="ev-dot" aria-hidden="true"></span>
              <b>{eventText(event)}</b>
              <span className="ev-sub">
                {fullName(profiles, event.actor_id)} · {formatDateTime(event.created_at)}
              </span>
              <EditDiff event={event} />
              {event.comment && <p className="ev-cmt">{event.comment}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
