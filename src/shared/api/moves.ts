import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { STATUS_LABEL } from '../lib/status';
import { useUndo } from '../ui/UndoProvider/UndoProvider';
import { supabase } from './client';
import { unwrap } from './errors';
import { keys } from './queries';
import { useMe } from './session';
import type { BoardTask, TaskEvent, TaskStatus } from './types';

function patchTask(queryClient: QueryClient, id: string, fields: Partial<BoardTask>) {
  queryClient.setQueryData<BoardTask[]>(keys.board, (rows) =>
    rows?.map((t) => (t.id === id ? { ...t, ...fields } : t)),
  );
  queryClient.setQueryData<BoardTask | null>(keys.task(id), (t) => (t ? { ...t, ...fields } : t));
}

// Отрицательный id: строка истории только для показа, настоящую вернёт база.
let lastTempEventId = 0;

export type MoveOptions = {
  /** Комментарий к смене статуса. При возврате на доработку обязателен: проверяет база и окно возврата. */
  comment?: string | null;
  /** База отказала или нет связи: верните текст комментария в поле, ввод не должен пропасть. */
  onRefused?: () => void;
};

/**
 * Смена статуса с окном отмены: показ меняется сразу, в базу уходит через 10 секунд (AC-12).
 * Это единственный способ сменить статус с сайта.
 */
export function useMoveTask() {
  const queryClient = useQueryClient();
  const me = useMe();
  const { run } = useUndo();
  const actorId = me.id;

  return useCallback(
    (task: BoardTask, to: TaskStatus, options: MoveOptions = {}) => {
      const comment = options.comment?.trim() || null;
      const tempEvent: TaskEvent = {
        id: --lastTempEventId,
        task_id: task.id,
        kind: 'status',
        actor_id: actorId,
        from_status: task.status,
        to_status: to,
        comment,
        field: null,
        old_value: null,
        new_value: null,
        created_at: new Date().toISOString(),
      };
      const moved: Partial<BoardTask> =
        to === 'rework'
          ? {
              status: to,
              return_count: task.return_count + 1,
              last_return_comment: comment,
              last_return_by: actorId,
              last_return_at: tempEvent.created_at,
            }
          : { status: to };

      run({
        key: task.id,
        text: `Задача теперь «${STATUS_LABEL[to]}»`,
        flash: { to, taskId: task.id },
        apply() {
          patchTask(queryClient, task.id, moved);
          queryClient.setQueryData<TaskEvent[]>(keys.events(task.id), (events) =>
            events && !events.some((e) => e.id === tempEvent.id) ? [...events, tempEvent] : events,
          );
        },
        revert() {
          patchTask(queryClient, task.id, {
            status: task.status,
            return_count: task.return_count,
            last_return_comment: task.last_return_comment,
            last_return_by: task.last_return_by,
            last_return_at: task.last_return_at,
          });
          queryClient.setQueryData<TaskEvent[]>(keys.events(task.id), (events) =>
            events?.filter((e) => e.id !== tempEvent.id),
          );
        },
        commit: async () =>
          unwrap(
            await supabase.rpc('change_task_status', { p_task_id: task.id, p_to: to, p_comment: comment }),
          ),
        settle() {
          void queryClient.invalidateQueries({ queryKey: keys.tasks });
          void queryClient.invalidateQueries({ queryKey: keys.events(task.id) });
        },
        onRefused: options.onRefused,
      });
    },
    [queryClient, actorId, run],
  );
}
