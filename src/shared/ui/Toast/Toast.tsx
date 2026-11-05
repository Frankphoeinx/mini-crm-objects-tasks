import { Icon } from '../Icons';

/** Подсказка внизу экрана. Показывать через useToast, хост живёт в UndoProvider. */
export function Toast({ text }: { text: string }) {
  return (
    <div className="toast">
      <Icon name="rework" />
      <span aria-hidden="true">{text}</span>
    </div>
  );
}
