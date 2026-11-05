import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { userMessage } from '../../api/errors';
import { useLeaveGuard } from '../../lib/useLeaveGuard';
import { FOCUS_DELAY_MS, focusTask } from '../focus';
import { portalRoot } from '../portal';
import { Toast } from '../Toast';
import { createUndoStore, type MoveFlash, type UndoStore } from './undoStore';

const UndoContext = createContext<UndoStore | null>(null);

function useStore() {
  const store = use(UndoContext);
  if (!store) throw new Error('Нужен UndoProvider выше по дереву');
  return store;
}

/**
 * Очередь отмены и хост подсказок. Одно окно на сайт: новое действие сначала отправляет предыдущее.
 * Смена пользователя пересоздаёт провайдер по key: неотправленное не уйдёт в базу от чужого имени.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [store] = useState(() => createUndoStore(userMessage));
  const { undo, toast, flash } = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const announcement = [undo?.text, toast].filter(Boolean).join('. ');

  useEffect(() => store.dispose, [store]);
  // Смена статуса уходит в базу после окна отмены: закрытие вкладки её снимет, поэтому браузер спросит.
  useLeaveGuard(() => store.getSnapshot().undo !== null);

  // Кнопка перехода уходит вместе с карточкой, кнопка «Отменить» вместе с полосой отмены.
  useEffect(() => {
    const { taskId } = flash;
    if (!taskId) return;
    const timer = setTimeout(() => focusTask(taskId), FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  // Возврат на вкладку и чужие правки перезагружают данные: действие в окне отмены не должно пропасть с экрана.
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success' && !event.action.manual) store.reapply();
      }),
    [queryClient, store],
  );

  return (
    <UndoContext value={store}>
      {children}
      {createPortal(
          <>
            {/* Область живёт постоянно: иначе диктор может пропустить текст, появившийся вместе с ней. */}
            <div className="sr" aria-live="polite" aria-atomic="true" role={announcement ? 'status' : undefined}>
              {announcement}
            </div>
            {undo && (
              <div className="toast undo">
                <span aria-hidden="true">{undo.text}</span>
                <button className="undo-btn" type="button" onClick={store.undo}>
                  Отменить
                </button>
                <span className={`undo-bar ${undo.seq % 2 ? 'is-odd' : 'is-even'}`} aria-hidden="true"></span>
              </div>
            )}
            {toast && <Toast text={toast} />}
          </>,
          portalRoot(),
        )}
    </UndoContext>
  );
}

/** run(action): показать действие и открыть окно отмены. discard(key): снять действия удалённой записи. */
export function useUndo() {
  const { run, discard } = useStore();
  return { run, discard };
}

/** showToast(text, ms?): подсказка внизу экрана. */
export function useToast() {
  const { showToast } = useStore();
  return { showToast };
}

/** Какая смена статуса только что случилась: для анимации карточки. */
export function useMoveFlash(): MoveFlash {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().flash);
}
