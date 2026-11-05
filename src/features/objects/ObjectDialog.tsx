import { useRef, useState, type FormEvent } from 'react';
import { useCreateObject, useUpdateObject, userMessage, type ObjectRow } from '@/shared/api';
import { Dialog } from '@/shared/ui';

const REQUIRED = 'Заполните название и адрес.';
const ERROR_ID = 'bs-oerr';

/** Окно создания объекта, с object: правки. При отказе базы окно остаётся открытым, ввод не пропадает. */
export function ObjectDialog({ object, onClose }: { object?: ObjectRow; onClose: () => void }) {
  const create = useCreateObject();
  const update = useUpdateObject();
  const [name, setName] = useState(object?.name ?? '');
  const [address, setAddress] = useState(object?.address ?? '');
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const busy = create.isPending || update.isPending;
  const title = object ? 'Изменить объект' : 'Новый объект';

  function save(e: FormEvent) {
    e.preventDefault();
    const values = { name: name.trim(), address: address.trim() };
    if (!values.name || !values.address) {
      setError(REQUIRED);
      (values.name ? addressRef : nameRef).current?.focus();
      return;
    }
    const callbacks = { onSuccess: () => onClose(), onError: (err: unknown) => setError(userMessage(err)) };
    if (object) update.mutate({ id: object.id, ...values }, callbacks);
    else create.mutate(values, callbacks);
  }

  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      {(requestClose) => (
        <form onSubmit={save} noValidate>
          <h2>{title}</h2>
          <div className="field">
            <label htmlFor="bs-oname">Название</label>
            <input
              id="bs-oname"
              className="input"
              ref={nameRef}
              value={name}
              aria-invalid={error === REQUIRED && !name.trim()}
              aria-describedby={error ? ERROR_ID : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="bs-oaddr">Адрес</label>
            <input
              id="bs-oaddr"
              className="input"
              ref={addressRef}
              value={address}
              aria-invalid={error === REQUIRED && !address.trim()}
              aria-describedby={error ? ERROR_ID : undefined}
              onChange={(e) => {
                setAddress(e.target.value);
                setError('');
              }}
            />
          </div>
          {error && (
            <p id={ERROR_ID} className="err" role="alert">
              {error}
            </p>
          )}
          <div className="row-btns">
            <button className="btn is-soft" type="button" onClick={requestClose} disabled={busy}>
              Отмена
            </button>
            <button className="btn is-primary" type="submit" disabled={busy}>
              Сохранить
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
