import { useState } from 'react';
import { useMe, useObjects, useObjectTasks, useProfiles, type BoardTask, type ObjectRow, type Profile } from '@/shared/api';
import { shortName } from '@/shared/lib';
import { EmptyState, QueryState } from '@/shared/ui';
import { Board } from './Board';
import { CreateTaskDialog } from './CreateTaskDialog';

type LoadedProps = { objectId: string; tasks: BoardTask[]; people: Profile[]; objects: ObjectRow[] };

function LoadedBoard({ objectId, tasks, people, objects }: LoadedProps) {
  const me = useMe();
  const [adding, setAdding] = useState(false);
  const add = me.isManager ? () => setAdding(true) : undefined;

  return (
    <>
      {tasks.length === 0 ? (
        <EmptyState
          icon="new"
          title="На этом объекте пока нет задач"
          text="Первая задача станет первым этажом здания."
          action={
            add && (
              <button className="btn is-primary" type="button" onClick={add}>
                Создать задачу
              </button>
            )
          }
        />
      ) : (
        <Board tasks={tasks} from="object" metaOf={(t) => ({ icon: 'work', text: shortName(people, t.assignee_id) })} onAdd={add} people={people} />
      )}
      {adding && <CreateTaskDialog objectId={objectId} objects={objects} people={people} onClose={() => setAdding(false)} />}
    </>
  );
}

/** Всё ниже шапки страницы объекта. Имена исполнителей и список объектов нужны карточкам и окну создания: без них доска не показывается. */
export function ObjectBoard({ objectId }: { objectId: string }) {
  const tasks = useObjectTasks(objectId);
  const profiles = useProfiles();
  const objects = useObjects();

  return (
    <QueryState query={tasks}>
      {(rows) => (
        <QueryState query={profiles}>
          {(people) => <QueryState query={objects}>{(places) => <LoadedBoard objectId={objectId} tasks={rows} people={people} objects={places} />}</QueryState>}
        </QueryState>
      )}
    </QueryState>
  );
}
