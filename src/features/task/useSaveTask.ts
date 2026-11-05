import { useUpdateTask, userMessage, type TaskPatch } from '@/shared/api';
import { useToast } from '@/shared/ui';

// Столько же держится отказ при смене статуса в очереди отмены.
const ERROR_TOAST_MS = 6_000;

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
