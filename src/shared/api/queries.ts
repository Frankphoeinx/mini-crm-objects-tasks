import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { movesFor } from '../lib/status';
import { supabase } from './client';
import { unwrap } from './errors';
import { useMe } from './session';
import type { BoardTask, ObjectRow } from './types';

export const keys = {
  tasks: ['tasks'] as const,
  board: ['tasks', 'board'] as const,
  task: (id: string) => ['tasks', 'detail', id] as const,
  allEvents: ['task-events'] as const,
  events: (taskId: string) => ['task-events', taskId] as const,
  objects: ['objects'] as const,
  objectList: ['objects', 'list'] as const,
  object: (id: string) => ['objects', 'detail', id] as const,
  profiles: ['profiles', 'list'] as const,
};

// Один запрос на все доступные задачи: сводка, доски и счётчик считаются из него, строки уже несут сведения о возвратах.
const boardQuery = queryOptions({
  queryKey: keys.board,
  queryFn: async ({ signal }) =>
    unwrap(await supabase.from('task_board').select('*').order('created_at').order('id').abortSignal(signal)),
});

export function useBoardTasks() {
  return useQuery(boardQuery);
}

export function useObjectTasks(objectId: string) {
  return useQuery({ ...boardQuery, select: (rows) => rows.filter((t) => t.object_id === objectId) });
}

export function useMyTasks() {
  const me = useMe();
  return useQuery({ ...boardQuery, select: (rows) => rows.filter((t) => t.assignee_id === me.id) });
}

export function useReviewTasks() {
  return useQuery({ ...boardQuery, select: (rows) => rows.filter((t) => t.status === 'review') });
}

/** Счётчик вкладки «Мои задачи»: мои задачи, которые ждут моего действия. */
export function useMyTurnCount(): number {
  const me = useMe();
  const { data } = useQuery({
    ...boardQuery,
    select: (rows) => rows.filter((t) => t.assignee_id === me.id && movesFor(t, me).length > 0).length,
  });
  return data ?? 0;
}

/** Задача из task_board. null: не найдена или скрыта правами. Пока идёт запрос, показывает строку из уже загруженной доски. */
export function useTask(id: string) {
  const queryClient = useQueryClient();
  return useQuery<BoardTask | null>({
    queryKey: keys.task(id),
    queryFn: async ({ signal }) =>
      unwrap(await supabase.from('task_board').select('*').eq('id', id).abortSignal(signal).maybeSingle()),
    placeholderData: () => queryClient.getQueryData<BoardTask[]>(keys.board)?.find((t) => t.id === id),
  });
}

export function useTaskEvents(taskId: string) {
  return useQuery({
    queryKey: keys.events(taskId),
    queryFn: async ({ signal }) =>
      unwrap(
        await supabase
          .from('task_events')
          .select('*')
          .eq('task_id', taskId)
          .order('created_at')
          .order('id')
          .abortSignal(signal),
      ),
  });
}

export function useObjects() {
  return useQuery({
    queryKey: keys.objectList,
    queryFn: async ({ signal }) =>
      unwrap(await supabase.from('objects').select('*').order('created_at').order('id').abortSignal(signal)),
  });
}

/** Объект. null: не найден или скрыт правами. */
export function useObject(id: string) {
  const queryClient = useQueryClient();
  return useQuery<ObjectRow | null>({
    queryKey: keys.object(id),
    queryFn: async ({ signal }) =>
      unwrap(await supabase.from('objects').select('*').eq('id', id).abortSignal(signal).maybeSingle()),
    placeholderData: () => queryClient.getQueryData<ObjectRow[]>(keys.objectList)?.find((o) => o.id === id),
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: async ({ signal }) =>
      unwrap(await supabase.from('profiles').select('*').order('full_name').abortSignal(signal)),
  });
}
