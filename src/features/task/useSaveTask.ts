import { useRef } from 'react';
import { ApiError, useUpdateTask, userMessage, type BoardTask, type TaskPatch } from '@/shared/api';
import { ERROR_TOAST_MS, useToast } from '@/shared/undo';

const TEXT_CONFLICT = 'Этот текст только что изменил другой постановщик. Ваш вариант остался в поле: сверьте его с новой записью в истории и сохраните ещё раз.';

/** Правка задачи на месте. Отказ базы показан подсказкой: её видно, даже если экран уже закрыли. Промис save не падает: false значит «не сохранено». */
export function useSaveTask(task: Pick<BoardTask, 'id' | 'text_version'>) {
  const update = useUpdateTask();
  const { showToast } = useToast();
  // Своя правка повышает номер раньше, чем придут свежие данные экрана.
  const ownVersion = useRef(0);
  return {
    save: (patch: TaskPatch) => {
      const isText = 'title' in patch || 'description' in patch;
      const textVersion = isText ? Math.max(task.text_version, ownVersion.current) : undefined;
      return update.mutateAsync({ id: task.id, patch, textVersion }).then(
        (row) => {
          ownVersion.current = row.text_version;
          return true;
        },
        (error: unknown) => {
          const conflict = isText && error instanceof ApiError && error.kind === 'not-found';
          showToast(conflict ? TEXT_CONFLICT : userMessage(error), ERROR_TOAST_MS);
          return false;
        },
      );
    },
    /** Что сейчас сохраняется: кнопка выбора показывает новое значение сразу, а не после ответа базы. */
    pending: update.isPending ? update.variables.patch : undefined,
  };
}
