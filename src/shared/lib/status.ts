// Логика показа статусов из crm-core.js. Здесь только то, что показать: права проверяет база.
import type { BoardTask, Role, TaskStatus } from '../api/types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  work: 'В работе',
  review: 'На проверке',
  rework: 'На доработке',
  accepted: 'Принята',
};

export type Move = {
  to: TaskStatus;
  /** Кто делает: назначенный исполнитель или любой постановщик. */
  by: 'assignee' | 'manager';
  label: string;
  short: string;
  needComment?: boolean;
  danger?: boolean;
};

const MOVES: Record<TaskStatus, Move[]> = {
  new: [{ to: 'work', by: 'assignee', label: 'Взять в работу', short: 'В работу' }],
  work: [{ to: 'review', by: 'assignee', label: 'Отправить на проверку', short: 'На проверку' }],
  review: [
    { to: 'accepted', by: 'manager', label: 'Принять', short: 'Принять' },
    { to: 'rework', by: 'manager', label: 'Вернуть на доработку', short: 'Вернуть', needComment: true, danger: true },
  ],
  rework: [{ to: 'work', by: 'assignee', label: 'Снова взять в работу', short: 'В работу' }],
  accepted: [],
};

type Viewer = { id: string; role: Role };

/** Какие переходы показать пользователю (AC-2). Постановщик, назначивший себя, действует и как исполнитель (AC-15). */
export function movesFor(task: Pick<BoardTask, 'status' | 'assignee_id'>, me: Viewer): Move[] {
  return MOVES[task.status].filter((m) => (m.by === 'manager' ? me.role === 'manager' : task.assignee_id === me.id));
}

/** Кнопка «Назначить» на карточке: только постановщику и только у задачи без исполнителя (AC-15, AC-16). */
export function canAssign(task: Pick<BoardTask, 'assignee_id'>, me: Pick<Viewer, 'role'>) {
  return me.role === 'manager' && !task.assignee_id;
}

/** Снять исполнителя совсем можно только у «Новой» (AC-15). */
export function canClearAssignee(status: TaskStatus) {
  return status === 'new';
}

const COLUMNS: Record<Role, TaskStatus[]> = {
  manager: ['new', 'work', 'review', 'rework', 'accepted'],
  worker: ['new', 'work', 'review', 'accepted'],
};

/** У исполнителя нет колонки доработки: задача лежит в «Новой», статус в базе остаётся «На доработке» (AC-9). */
export function columnOf(status: TaskStatus, role: Role): TaskStatus {
  return role === 'worker' && status === 'rework' ? 'new' : status;
}

export type BoardColumn<T> = { key: TaskStatus; label: string; tasks: T[] };

/** Колонки доски для роли. Задача на доработке идёт первой (AC-9). */
export function buildBoard<T extends Pick<BoardTask, 'status'>>(tasks: T[], role: Role): BoardColumn<T>[] {
  return COLUMNS[role].map((key) => ({
    key,
    label: STATUS_LABEL[key],
    tasks: tasks
      .filter((t) => columnOf(t.status, role) === key)
      .sort((a, b) => Number(b.status === 'rework') - Number(a.status === 'rework')),
  }));
}

/** Второй круг: задачу возвращали и она ещё не принята (AC-11). */
export function isReturned(task: Pick<BoardTask, 'status' | 'return_count'>) {
  return task.status !== 'accepted' && task.return_count > 0;
}

/** Текст подсказки при переносе в запрещённую колонку. */
export function deniedMoveText(status: TaskStatus, moves: Move[]) {
  return `Так нельзя: из «${STATUS_LABEL[status]}» задача идёт только в «${moves.map((m) => STATUS_LABEL[m.to]).join('» или «')}».`;
}
