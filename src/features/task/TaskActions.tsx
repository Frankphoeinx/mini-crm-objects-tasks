import { useRef, useState } from 'react';
import { useMe, useMoveTask, type BoardTask, type Profile } from '@/shared/api';
import { COMMENT_REQUIRED, delay, formatDateTime, fullName, hasComment, isReturned, movesFor, shortName, STATUS_LABEL, type Move } from '@/shared/lib';
import { Icon } from '@/shared/ui';

function waitText(task: BoardTask, profiles: Profile[]) {
  if (task.status === 'accepted') return 'Задача принята, дальше действий нет.';
  if (!task.assignee_id) return 'Исполнитель пока не назначен.';
  if (task.status === 'review') return 'Задача на проверке у постановщика.';
  return `Сейчас ход исполнителя: ${shortName(profiles, task.assignee_id)}.`;
}

/** Блок действий: статус показан только здесь, кнопки только доступные (права держит база). */
export function TaskActions({ task, profiles }: { task: BoardTask; profiles: Profile[] }) {
  const me = useMe();
  const moveTask = useMoveTask();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const moves = movesFor(task, me);
  const isDone = task.status === 'accepted';

  function run(move: Move) {
    const text = comment.trim();
    if (move.needComment && !hasComment(text)) {
      setError(COMMENT_REQUIRED);
      commentRef.current?.focus();
      return;
    }
    setComment('');
    setError('');
    // Отмена, отказ базы или нет связи: комментарий возвращается в поле, если там ещё не начали новый.
    const giveBack = () => setComment((current) => current || text);
    moveTask(task, move.to, { comment: text, onRefused: giveBack, onUndone: giveBack });
  }

  return (
    <aside
      className={`tile tk-act w ${moves.length ? 'is-go' : isDone ? 'is-done' : ''}`}
      style={delay('25ms')}
      aria-label="Действия"
    >
      <span className="fx" aria-hidden="true"></span>
      <div className="act-top">
        <div>
          <span className="lbl">{moves.length ? 'Ваш ход' : isDone ? 'Готово' : 'Сейчас'}</span>
          <div className="act-st">{STATUS_LABEL[task.status]}</div>
        </div>
        <Icon name={task.status} className="ic-xl act-ic" />
      </div>

      {isReturned(task) && task.last_return_comment && task.last_return_at && (
        <div className="act-why">
          <span className="lbl">Причина возврата</span>
          <b>{task.last_return_comment}</b>
          <small>
            {fullName(profiles, task.last_return_by)} · {formatDateTime(task.last_return_at)}
          </small>
        </div>
      )}

      {moves.length > 0 ? (
        <>
          <div className="field">
            <label htmlFor="bs-comment">
              {moves.some((m) => m.needComment) ? 'Комментарий. Обязателен при возврате на доработку' : 'Комментарий, если нужен'}
            </label>
            <textarea
              id="bs-comment"
              className="input"
              ref={commentRef}
              value={comment}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'bs-comment-err' : undefined}
              onChange={(e) => {
                setComment(e.target.value);
                setError('');
              }}
            />
            {error && (
              <p id="bs-comment-err" className="err" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="act-btns">
            {moves.map((move) => (
              <button
                key={move.to}
                className={`btn ${move.danger ? 'is-danger' : 'is-primary'}`}
                type="button"
                // На месте нажатой кнопки сразу появляется следующая: второй щелчок двойного нажатия не должен сменить статус ещё раз.
                onClick={(e) => {
                  if (e.detail < 2) run(move);
                }}
              >
                {move.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="wait">{waitText(task, profiles)}</p>
      )}
    </aside>
  );
}
