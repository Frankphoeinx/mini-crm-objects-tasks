import { Icon } from '../Icons';

/** Подсказка внизу экрана. Показывать через useToast, хост живёт в UndoProvider. */
export function Toast({ text }: { text: string }) {
  return (
    <div className="toast" role="status">
      <Icon name="rework" />
      <span>{text}</span>
    </div>
  );
}
