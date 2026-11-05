import { Link } from 'react-router';
import { paths, taskLinkState, type TaskFrom } from '../../lib/routes';

/** Название задачи на карточке: ссылка на всю карточку. draggable: тянется вся карточка, а не ссылка. */
export function TaskLink({ id, title, from }: { id: string; title: string; from: TaskFrom }) {
  return (
    <Link className="kopen" to={paths.task(id)} state={taskLinkState(from)} draggable={false}>
      <span className="vt" style={{ display: 'block', viewTransitionName: `floor-${id}` }}>
        {title}
      </span>
    </Link>
  );
}
