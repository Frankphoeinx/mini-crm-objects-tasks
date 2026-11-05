import { useUpdateTask, userMessage, type TaskPatch } from '@/shared/api';
import { ERROR_TOAST_MS, useToast } from '@/shared/ui';

/** Правка задачи на месте. Отказ базы показан подсказкой: её видно, даже если экран уже закрыли. Промис save не падает. */
export function useSaveTask(taskId: string) {
  const update = useUpdateTask();
  const { showToast } = useToast();
  return {
    save: (patch: TaskPatch) =>
      update.mutateAsync({ id: taskId, patch }).catch((error: unknown) => showToast(userMessage(error), ERROR_TOAST_MS)),
    /** Что сейчас сохраняется: кнопка выбора показывает новое значение сразу, а не после ответа базы. */
    pending: update.isPending ? update.variables.patch : undefined,
  };
}
