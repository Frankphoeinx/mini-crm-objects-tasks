import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMe, type BoardTask, type ObjectRow, type Profile } from '@/shared/api';
import { canClearAssignee, formatDateTime, fullName } from '@/shared/lib';
import { Avatar, Icon, objectOptions, personOptions, Picker, type IconName, type PickerOption } from '@/shared/ui';
import { useSaveTask } from './useSaveTask';

function Row({ icon, label, pick = false, children }: { icon: IconName; label: string; pick?: boolean; children: ReactNode }) {
  return (
    <div className={pick ? 'person is-pick' : 'person'}>
      <dt>
        <span className="person-ic">
          <Icon name={icon} />
        </span>
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

type PickButtonProps = {
  label: string;
  name: string;
  avatar: ReactNode;
  value: string;
  options: PickerOption[];
  onPick: (id: string) => void;
};

function PickButton({ label, name, avatar, value, options, onPick }: PickButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        className="pick-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        aria-label={`${label}: ${name}`}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {avatar}
        <span>{name}</span>
        <Icon name="down" />
      </button>
      {anchor && (
        <Picker
          anchor={anchor}
          value={value}
          options={options}
          onClose={() => setAnchor(null)}
          onPick={(id) => {
            if (id !== value) onPick(id);
          }}
        />
      )}
    </>
  );
}

type TaskPeopleProps = { task: BoardTask; profiles: Profile[]; objects: ObjectRow[] };

/** «Люди и даты»: постановщик меняет исполнителя и объект на месте, остальным это просто текст. */
export function TaskPeople({ task, profiles, objects }: TaskPeopleProps) {
  const me = useMe();
  const { save, pending } = useSaveTask(task.id);
  const shown = { ...task, ...pending };
  const assignee = fullName(profiles, shown.assignee_id);
  const place = objects.find((o) => o.id === shown.object_id)?.name ?? '';

  return (
    <section className="tile tk-people w" style={{ '--d': '75ms' } as CSSProperties}>
      <h2 className="tile-h">Люди и даты</h2>
      <dl className="people">
        <Row icon="work" label="Исполнитель" pick={me.isManager}>
          {me.isManager ? (
            <PickButton
              label="Исполнитель"
              name={assignee}
              avatar={<Avatar person={profiles.find((p) => p.id === shown.assignee_id) ?? null} />}
              value={shown.assignee_id ?? ''}
              options={personOptions(profiles, canClearAssignee(task.status))}
              onPick={(id) => void save({ assignee_id: id || null })}
            />
          ) : (
            <span>{assignee}</span>
          )}
        </Row>
        <Row icon="pin" label="Объект" pick={me.isManager}>
          {me.isManager ? (
            <PickButton
              label="Объект"
              name={place}
              avatar={<Avatar place />}
              value={shown.object_id}
              options={objectOptions(objects)}
              onPick={(id) => void save({ object_id: id })}
            />
          ) : (
            <span>{place}</span>
          )}
        </Row>
        <Row icon="crane" label="Автор">
          {fullName(profiles, task.author_id)}
        </Row>
        <Row icon="cal" label="Создана">
          {formatDateTime(task.created_at)}
        </Row>
      </dl>
    </section>
  );
}
