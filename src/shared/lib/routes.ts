export const paths = {
  login: '/login',
  objects: '/objects',
  object: (id: string) => `/objects/${id}`,
  task: (id: string) => `/tasks/${id}`,
  my: '/my',
  review: '/review',
};

/** Откуда открыли задачу: от этого зависят кнопка «назад» и активная вкладка. Передаётся в state перехода. */
export type TaskFrom = 'object' | 'my' | 'review';

export function taskLinkState(from: TaskFrom) {
  return { from };
}

export function readTaskFrom(state: unknown): TaskFrom {
  const from = (state as { from?: unknown } | null)?.from;
  return from === 'my' || from === 'review' ? from : 'object';
}
