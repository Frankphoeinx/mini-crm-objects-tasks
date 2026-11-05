export const UNDO_MS = 10_000;
export const TOAST_MS = 3_400;
export const ERROR_TOAST_MS = 6_000;
export const FLASH_MS = 900;

export type UndoAction = {
  /** Одна сущность, один ключ: зависимое действие снимается вместе с отказанным. */
  key: string;
  text: string;
  /** Показать действие. Вызывается повторно после фоновой загрузки, поэтому должно быть идемпотентным. */
  apply(): void;
  revert(): void;
  commit(): Promise<unknown>;
  /** После любого исхода: сверить показ с базой. */
  settle?(): void;
  onRefused?(error: unknown): void;
  flash?: { to: string; taskId: string };
};

/** Для анимации переноса: класс flash-<to> на корне и is-landed на карточке taskId. После отмены to = null. */
export type MoveFlash = { to: string | null; taskId: string | null };

export type UndoSnapshot = {
  undo: { text: string; seq: number } | null;
  toast: string | null;
  flash: MoveFlash;
};

const NO_FLASH: MoveFlash = { to: null, taskId: null };

export function createUndoStore(describeError: (error: unknown) => string) {
  let snapshot: UndoSnapshot = { undo: null, toast: null, flash: NO_FLASH };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<UndoSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  let current: { action: UndoAction; timer: ReturnType<typeof setTimeout> } | null = null;
  // Видны в кэше, но база их ещё не подтвердила.
  const live = new Set<UndoAction>();
  // Действия уходят в базу строго по очереди: второй переход опирается на первый.
  let chain: Promise<unknown> = Promise.resolve();
  let seq = 0;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  function closeWindow() {
    if (!current) return null;
    const { action, timer } = current;
    clearTimeout(timer);
    current = null;
    update({ undo: null });
    return action;
  }

  function showToast(text: string, ms = TOAST_MS) {
    clearTimeout(toastTimer);
    update({ toast: text });
    toastTimer = setTimeout(() => update({ toast: null }), ms);
  }

  function showFlash(flash: MoveFlash) {
    clearTimeout(flashTimer);
    update({ flash });
    flashTimer = setTimeout(() => update({ flash: NO_FLASH }), FLASH_MS);
  }

  function takeBack(action: UndoAction) {
    live.delete(action);
    action.revert();
    action.settle?.();
  }

  function send(action: UndoAction) {
    chain = chain.then(action.commit).then(
      () => {
        live.delete(action);
        action.settle?.();
      },
      (error: unknown) => {
        // Следующее действие над той же записью строилось на отказанном: снимаем сначала его.
        if (current?.action.key === action.key) {
          const dependent = closeWindow();
          if (dependent) takeBack(dependent);
        }
        takeBack(action);
        action.onRefused?.(error);
        showToast(describeError(error), ERROR_TOAST_MS);
      },
    );
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    showToast,

    run(action: UndoAction) {
      const previous = closeWindow();
      if (previous) send(previous);
      live.add(action);
      action.apply();
      current = {
        action,
        timer: setTimeout(() => {
          const expired = closeWindow();
          if (expired) send(expired);
        }, UNDO_MS),
      };
      update({ undo: { text: action.text, seq: ++seq } });
      if (action.flash) showFlash(action.flash);
    },

    undo() {
      const action = closeWindow();
      if (!action) return;
      takeBack(action);
      if (action.flash) showFlash({ to: null, taskId: action.flash.taskId });
    },

    /** Фоновая загрузка заменила данные в кэше: возвращаем поверх них ещё не подтверждённые действия. */
    reapply() {
      live.forEach((action) => action.apply());
    },

    /** Уход и смена пользователя: окно закрывается, неотправленное в базу не уходит (допущение AC-12). */
    dispose() {
      if (current) clearTimeout(current.timer);
      current = null;
      clearTimeout(toastTimer);
      clearTimeout(flashTimer);
    },
  };
}

export type UndoStore = ReturnType<typeof createUndoStore>;
