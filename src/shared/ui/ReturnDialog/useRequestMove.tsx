import { useRef, useState } from 'react';
import { useMoveTask } from '../../api/moves';
import type { BoardTask } from '../../api/types';
import type { Move } from '../../lib/status';
import { ReturnDialog } from './ReturnDialog';

/**
 * Нажатие кнопки перехода на карточке, в строке проверки и бросок на доске: без комментария сразу окно отмены, с обязательным сначала окно возврата.
 * moveDialog положите в разметку экрана.
 */
export function useRequestMove() {
  const moveTask = useMoveTask();
  const [returning, setReturning] = useState<{ task: BoardTask; move: Move; comment: string } | null>(null);

  // Текст возврата, снятого кнопкой «Отменить»: окно откроется снова с ним.
  const drafts = useRef(new Map<string, string>());

  function requestMove(task: BoardTask, move: Move) {
    if (move.needComment) setReturning({ task, move, comment: drafts.current.get(task.id) ?? '' });
    else moveTask(task, move.to);
  }

  const moveDialog = returning && (
    <ReturnDialog
      key={returning.task.id}
      taskTitle={returning.task.title}
      initialComment={returning.comment}
      onClose={() => setReturning(null)}
      onConfirm={(comment) => {
        const { task, move } = returning;
        setReturning(null);
        drafts.current.delete(task.id);
        moveTask(task, move.to, {
          comment,
          onRefused: () => setReturning({ task, move, comment }),
          onUndone: () => drafts.current.set(task.id, comment),
        });
      }}
    />
  );

  return { requestMove, moveDialog };
}
