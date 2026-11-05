import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useUndo } from '../ui/UndoProvider/UndoProvider';
import { supabase } from './client';
import { unwrap } from './errors';
import { keys } from './queries';
import type { BoardTask, NewObject, NewTask, ObjectRow, TaskPatch } from './types';

// Мутации держат isPending, пока списки не обновятся: окно закрывается уже над свежими данными.

export function useCreateObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewObject) =>
      unwrap(await supabase.from('objects').insert(values).select().single()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.objects }),
  });
}

export function useUpdateObject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: NewObject & { id: string }) =>
      unwrap(await supabase.from('objects').update(values).eq('id', id).select().single()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.objects }),
  });
}

/** Открытый экран ещё виден, поэтому его запись убираем из кэша без перезапроса: иначе мелькнёт «не найдено» до перехода. */
function forgetTask(queryClient: QueryClient, id: string) {
  queryClient.setQueryData<BoardTask[]>(keys.board, (rows) => rows?.filter((t) => t.id !== id));
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.board }),
    queryClient.invalidateQueries({ queryKey: keys.task(id), refetchType: 'none' }),
    queryClient.invalidateQueries({ queryKey: keys.objectList }),
  ]);
}

export function useDeleteObject() {
  const queryClient = useQueryClient();
  const { discard } = useUndo();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.rpc('delete_object', { p_object_id: id }));
    },
    onSuccess: (_data, id) => {
      queryClient.getQueryData<BoardTask[]>(keys.board)?.filter((t) => t.object_id === id).forEach((t) => discard(t.id));
      queryClient.setQueryData<ObjectRow[]>(keys.objectList, (rows) => rows?.filter((o) => o.id !== id));
      queryClient.setQueryData<BoardTask[]>(keys.board, (rows) => rows?.filter((t) => t.object_id !== id));
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.objectList }),
        queryClient.invalidateQueries({ queryKey: keys.object(id), refetchType: 'none' }),
        // Открытая карточка задачи сейчас не на экране: перезапросится доска, карточки и история при следующем открытии.
        queryClient.invalidateQueries({ queryKey: keys.tasks }),
        queryClient.invalidateQueries({ queryKey: keys.allEvents, refetchType: 'none' }),
      ]);
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewTask) => unwrap(await supabase.from('tasks').insert(values).select().single()),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.tasks }),
        queryClient.invalidateQueries({ queryKey: keys.objects }),
      ]),
  });
}

/** Правка без окна отмены: название, описание, объект, исполнитель. Статус меняет только useMoveTask. */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) =>
      unwrap(await supabase.from('tasks').update(patch).eq('id', id).select().single()),
    onSettled: (_data, _error, { id }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.tasks }),
        queryClient.invalidateQueries({ queryKey: keys.events(id) }),
        queryClient.invalidateQueries({ queryKey: keys.objects }),
      ]),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { discard } = useUndo();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.rpc('delete_task', { p_task_id: id }));
    },
    onSuccess: (_data, id) => {
      discard(id);
      return forgetTask(queryClient, id);
    },
  });
}
