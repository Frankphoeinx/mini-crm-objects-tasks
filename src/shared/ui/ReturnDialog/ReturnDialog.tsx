import { useRef, useState, type FormEvent } from 'react';
import { COMMENT_REQUIRED, hasComment } from '../../lib/status';
import { Dialog } from '../Dialog';

const TITLE = 'Вернуть на доработку';

type ReturnDialogProps = {
  taskTitle: string;
  /** Текст, который вернули после отказа базы: ввод не пропадает. */
  initialComment?: string;
  onConfirm: (comment: string) => void;
  onClose: () => void;
};

/** Окно возврата на доработку: комментарий обязателен. */
export function ReturnDialog({ taskTitle, initialComment = '', onConfirm, onClose }: ReturnDialogProps) {
  const [comment, setComment] = useState(initialComment);
  const [error, setError] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  function save(e: FormEvent) {
    e.preventDefault();
    const text = comment.trim();
    if (hasComment(text)) {
      onConfirm(text);
      return;
    }
    setError(COMMENT_REQUIRED);
    fieldRef.current?.focus();
  }

  return (
    <Dialog title={TITLE} onClose={onClose}>
      {(requestClose) => (
        <form onSubmit={save} noValidate>
          <span className="dialog-hz" aria-hidden="true"></span>
          <span className="lbl">{taskTitle}</span>
          <h2>{TITLE}</h2>
          <div className="field">
            <label htmlFor="bs-rcomment">Что нужно исправить</label>
            <textarea
              id="bs-rcomment"
              className="input"
              ref={fieldRef}
              value={comment}
              aria-invalid={!!error}
              aria-describedby={error ? 'bs-rcomment-err' : undefined}
              onChange={(e) => {
                setComment(e.target.value);
                setError('');
              }}
            ></textarea>
          </div>
          {error && (
            <p id="bs-rcomment-err" className="err" role="alert">
              {error}
            </p>
          )}
          <div className="row-btns">
            <button className="btn is-soft" type="button" onClick={requestClose}>
              Отмена
            </button>
            <button className="btn is-danger" type="submit">
              Вернуть
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
