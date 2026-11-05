import type { CSSProperties } from 'react';
import { useTaskEvents, type TaskEvent, type TaskStatus } from '@/shared/api';
import { STATUS_LABEL } from '@/shared/lib';
import { Icon } from '@/shared/ui';

/** Узлы и линии маршрута считаются по истории, как flag и on в crm-core.js. Создание тоже приводит в «Новую». */
export function routeMarks(status: TaskStatus, events: TaskEvent[]) {
  const reached = new Set<TaskStatus | null>(events.map((e) => e.to_status));
  const passed = new Set(events.map((e) => `${e.from_status}>${e.to_status}`));
  return {
    node: (key: TaskStatus) => (status === key ? 'now' : reached.has(key) ? 'done' : 'next'),
    line: (from: TaskStatus, to: TaskStatus) => (passed.has(`${from}>${to}`) ? 'on' : ''),
  };
}

const NODES: { key: TaskStatus; place: string }[] = [
  { key: 'new', place: 'n1' },
  { key: 'work', place: 'n2' },
  { key: 'review', place: 'n3' },
  { key: 'accepted', place: 'n4' },
  { key: 'rework', place: 'n5' },
];

export function StatusRoute({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const { data: events = [] } = useTaskEvents(taskId);
  const { node, line } = routeMarks(status, events);
  return (
    <section
      className="tile tk-route w"
      style={{ '--d': '50ms' } as CSSProperties}
      aria-label={`Маршрут статусов задачи: сейчас ${STATUS_LABEL[status]}`}
    >
      <div className="route">
        <span className={`r-seg s1 ${line('new', 'work')}`}></span>
        <span className={`r-seg s2 ${line('work', 'review')}`}></span>
        <span className={`r-seg s3 ${line('review', 'accepted')}`}></span>
        <span className={`r-loop l-l ${line('rework', 'work')}`}></span>
        <span className={`r-loop l-r ${line('review', 'rework')}`}></span>
        {NODES.map(({ key, place }) => (
          <div key={key} className={`r-node ${place} ${node(key)}`}>
            <span className="r-lb">{STATUS_LABEL[key]}</span>
            <span className="r-dot">
              <Icon name={key} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
