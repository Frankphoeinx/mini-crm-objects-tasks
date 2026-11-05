import { useRef, useState, type FormEvent } from 'react';
import { useCreateTask, userMessage, type ObjectRow, type Profile } from '@/shared/api';
import { DESCRIPTION_MAX, fullName } from '@/shared/lib';
import { Avatar, Dialog, Icon, objectOptions, personOptions, Picker, RichTextEditor } from '@/shared/ui';

const TITLE = 'Новая задача';
const ERROR_ID = 'bs-terr';
const DESCRIPTION_LABEL = 'Описание';

type CreateTaskDialogProps = {
  /** Объект, на котором открыли окно. */
  objectId: string;
  objects: ObjectRow[];
  people: Profile[];
  onClose: () => void;
};

/** Окно создания задачи. Статус и автора ставит база; исполнителя можно выбрать позже. */
export function CreateTaskDialog({ objectId, objects, people, onClose }: CreateTaskDialogProps) {
  const create = useCreateTask();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [placeId, setPlaceId] = useState(objectId);
  const [assigneeId, setAssigneeId] = useState('');
  const [titleMissing, setTitleMissing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState<{ kind: 'object' | 'person'; anchor: HTMLElement } | null>(null);

  function save(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) {
      setTitleMissing(true);
      titleRef.current?.focus();
      return;
    }
    // Причину уже показывает редактор, введённое остаётся.
    if (description.length > DESCRIPTION_MAX) {
      e.currentTarget.querySelector<HTMLElement>(`[aria-label="${DESCRIPTION_LABEL}"]`)?.focus();
      return;
    }
    create.mutate({ object_id: placeId, title: name, description: description.trim(), assignee_id: assigneeId || null }, { onSuccess: () => onClose() });
  }

  const error = titleMissing ? 'Напишите название задачи.' : create.error && userMessage(create.error);

  return (
    <Dialog title={TITLE} onClose={onClose} busy={create.isPending}>
      {(requestClose) => (
        <form onSubmit={save} noValidate>
          <h2>{TITLE}</h2>
          <div className="field">
            <label htmlFor="bs-ttitle">Название</label>
            <input
              id="bs-ttitle"
              ref={titleRef}
              className="input"
              value={title}
              aria-invalid={titleMissing}
              aria-describedby={titleMissing ? ERROR_ID : undefined}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleMissing(false);
                // Только прошлый отказ: идущий запрос сбрасывать нельзя, иначе окно можно отправить второй раз.
                if (create.isError) create.reset();
              }}
            />
          </div>
          <div className="field">
            {/* Поле с разметкой не связать с label: название ему задаёт ariaLabel. */}
            <span className="rt-label">{DESCRIPTION_LABEL}</span>
            <RichTextEditor ariaLabel={DESCRIPTION_LABEL} placeholder="Добавьте описание" value={description} onChange={setDescription} onUploadingChange={setUploading} />
          </div>
          <div className="field">
            <label htmlFor="bs-tobj">Объект</label>
            <button id="bs-tobj" type="button" className="pick-trigger" aria-haspopup="listbox" onClick={(e) => setPicking({ kind: 'object', anchor: e.currentTarget })}>
              <Avatar place />
              <span>{objects.find((o) => o.id === placeId)?.name}</span>
              <Icon name="down" />
            </button>
          </div>
          <div className="field">
            <label htmlFor="bs-tuser">Исполнитель</label>
            <button id="bs-tuser" type="button" className="pick-trigger" aria-haspopup="listbox" onClick={(e) => setPicking({ kind: 'person', anchor: e.currentTarget })}>
              <Avatar person={people.find((p) => p.id === assigneeId) ?? null} />
              <span>{fullName(people, assigneeId || null)}</span>
              <Icon name="down" />
            </button>
          </div>
          {error && (
            <p id={ERROR_ID} className="err" role="alert">
              {error}
            </p>
          )}
          <div className="row-btns">
            <button className="btn is-soft" type="button" onClick={requestClose}>
              Отмена
            </button>
            <button className="btn is-primary" type="submit" disabled={create.isPending || uploading}>
              Сохранить
            </button>
          </div>
          {picking && (
            <Picker
              anchor={picking.anchor}
              value={picking.kind === 'object' ? placeId : assigneeId}
              options={picking.kind === 'object' ? objectOptions(objects) : personOptions(people, true)}
              onPick={picking.kind === 'object' ? setPlaceId : setAssigneeId}
              onClose={() => setPicking(null)}
            />
          )}
        </form>
      )}
    </Dialog>
  );
}
