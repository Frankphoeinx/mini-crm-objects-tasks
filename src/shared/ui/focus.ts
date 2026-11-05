/** Смена статуса успевает перерисовать доску: карточка переезжает в другую колонку и создаётся заново. */
export const FOCUS_DELAY_MS = 50;

/** Кнопка исчезла вместе с карточкой или окном, и фокус ушёл в начало страницы: возвращаем его к задаче. */
export function focusTask(taskId: string) {
  if (document.activeElement && document.activeElement !== document.body) return;
  const target =
    document.querySelector<HTMLElement>(`[data-card="${taskId}"] .kopen`) ??
    document.querySelector<HTMLElement>('.tk-act .btn, .tk-act .input') ??
    document.querySelector<HTMLElement>('main');
  target?.focus({ preventScroll: true });
}
