import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { BoardTask, Role, TaskStatus } from '@/shared/api';
import { columnOf, deniedMoveText, type Move } from '@/shared/lib';
import { useToast } from '@/shared/ui';

type Session = {
  task: BoardTask;
  moves: Move[];
  from: TaskStatus;
  /** Последняя колонка под курсором. При отказе браузер успевает прислать dragleave, поэтому она хранится отдельно от подсветки. */
  last: TaskStatus | null;
};

/** Перетаскивание карточек между колонками как в crm-core.js. Касанием не работает: на телефоне кнопки. */
export function useCardDrag(tasks: BoardTask[], role: Role, onDrop: (task: BoardTask, move: Move) => void) {
  const { showToast } = useToast();
  // Обработчики читают ref: состояние появляется только со следующего тика.
  const session = useRef<Session | null>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [started, setStarted] = useState<Session | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  useEffect(() => () => clearTimeout(startTimer.current), []);

  // Карточку убрали или перенесли прямо во время переноса (чужая правка, отказ базы): dragend со снятого элемента не дойдёт.
  const active = started && tasks.some((t) => t.id === started.task.id && columnOf(t.status, role) === started.from) ? started : null;

  function cardProps(task: BoardTask, moves: Move[]) {
    return {
      onDragStart(e: DragEvent) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        const next: Session = { task, moves, from: columnOf(task.status, role), last: null };
        session.current = next;
        // Синхронная правка DOM в dragstart отменяет перетаскивание.
        startTimer.current = setTimeout(() => setStarted(next), 0);
      },
      onDragEnd(e: DragEvent) {
        clearTimeout(startTimer.current);
        const ended = session.current;
        session.current = null;
        setStarted(null);
        setOver(null);
        if (!ended?.last || ended.last === ended.from) return;
        const move = ended.moves.find((m) => m.to === ended.last);
        if (!move) showToast(deniedMoveText(ended.task.status, ended.moves));
        else if (e.dataTransfer.dropEffect !== 'none') onDrop(ended.task, move);
      },
    };
  }

  function columnProps(key: TaskStatus) {
    function onDragOver(e: DragEvent) {
      const current = session.current;
      if (!current) return;
      current.last = key;
      // Браузер считает колонку целью, только если отменить и dragenter, и dragover.
      if (current.moves.some((m) => m.to === key)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
      setOver(key);
    }
    return {
      onDragEnter: onDragOver,
      onDragOver,
      onDragLeave(e: DragEvent) {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((cur) => (cur === key ? null : cur));
      },
      // Бросок считается в dragend. Без отмены Firefox пытается открыть перетащенный текст как адрес.
      onDrop(e: DragEvent) {
        e.preventDefault();
      },
    };
  }

  function columnClass(key: TaskStatus) {
    if (!active) return '';
    const kind = active.from === key ? 'is-source' : active.moves.some((m) => m.to === key) ? 'is-allowed' : 'is-denied';
    return over === key ? `${kind} is-over` : kind;
  }

  return { draggingId: active?.task.id ?? null, cardProps, columnProps, columnClass };
}
