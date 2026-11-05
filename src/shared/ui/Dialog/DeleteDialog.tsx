import type { TaskStatus } from '../../lib/types';
import { Icon } from '../Icons';
import { Dialog } from './Dialog';

type DeleteDialogProps = {
  title: string;
  text: string;
  /** Что скроется вместе с объектом. */
  items?: { id: string; status: TaskStatus; title: string }[];
  busy?: boolean;
  /** Текст отказа базы. */
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
};

/** Подтверждение удаления объекта и задачи. */
export function DeleteDialog({ title, text, items = [], busy = false, error, onConfirm, onClose }: DeleteDialogProps) {
  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      {(requestClose) => (
        <>
          <span className="dialog-hz" aria-hidden="true"></span>
          <h2>{title}</h2>
          <p>{text}</p>
          {items.length > 0 && (
            <ul className="pile">
              {items.map((item) => (
                <li key={item.id}>
                  <Icon name={item.status} />
                  <span>{item.title}</span>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          <div className="row-btns">
            <button className="btn is-soft" type="button" onClick={requestClose} disabled={busy}>
              Отмена
            </button>
            <button className="btn is-danger" type="button" onClick={onConfirm} disabled={busy}>
              Удалить
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
