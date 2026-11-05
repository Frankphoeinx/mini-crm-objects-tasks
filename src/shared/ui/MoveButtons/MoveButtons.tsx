import type { TaskStatus } from '../../api/types';
import type { Move } from '../../lib/status';

type MoveButtonsProps = {
  moves: Move[];
  onMove: (move: Move) => void;
  /** Наведение на кнопку подсвечивает колонку-цель. */
  onTarget?: (to: TaskStatus | null) => void;
};

/** Кнопки смены статуса на карточке доски и в строке проверки. */
export function MoveButtons({ moves, onMove, onTarget }: MoveButtonsProps) {
  return (
    <span className="kacts">
      {moves.map((move) => (
        <button
          key={move.to}
          className={`kq ${move.danger ? 'is-danger' : 'is-primary'}`}
          type="button"
          aria-label={move.label}
          // Карточка сразу уходит, и на её месте оказывается соседняя: второй щелчок двойного нажатия не должен её принять.
          onClick={(e) => {
            if (e.detail < 2) onMove(move);
          }}
          onMouseEnter={() => onTarget?.(move.to)}
          onMouseLeave={() => onTarget?.(null)}
          onFocus={() => onTarget?.(move.to)}
          onBlur={() => onTarget?.(null)}
        >
          {move.short}
        </button>
      ))}
    </span>
  );
}
