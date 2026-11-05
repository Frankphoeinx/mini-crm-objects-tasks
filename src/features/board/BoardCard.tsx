import type { CSSProperties, DragEvent } from 'react';
import { Link } from 'react-router';
import type { BoardTask, TaskStatus } from '@/shared/api';
import { isReturned, type Move } from '@/shared/lib';
import { Icon, MoveButtons, ReturnedChip, type IconName } from '@/shared/ui';

export type CardMeta = { icon: IconName; text: string };

type BoardCardProps = {
  task: BoardTask;
  meta: CardMeta;
  /** Что пользователь может сделать сейчас. Есть хоть что-то: крюк, кнопки, перетаскивание. */
  moves: Move[];
  /** Первый показ на экране: карточка идёт волной. */
  fresh: boolean;
  delay: string;
  dragging: boolean;
  landed: boolean;
  dragProps: { onDragStart(e: DragEvent): void; onDragEnd(e: DragEvent): void };
  /** Адрес страницы задачи и откуда на неё пришли. */
  to: string;
  linkState: unknown;
  onMove: (move: Move) => void;
  /** Наведение на кнопку подсвечивает колонку-цель. */
  onTarget: (to: TaskStatus | null) => void;
  /** Нет: кнопки «Назначить» нет. */
  onAssign?: (anchor: HTMLElement) => void;
  assignBusy: boolean;
};

export function cx(...names: (string | false)[]) {
  return names.filter(Boolean).join(' ');
}

export function BoardCard({ task, meta, moves, fresh, delay, dragging, landed, dragProps, to, linkState, onMove, onTarget, onAssign, assignBusy }: BoardCardProps) {
  const needsMe = moves.length > 0;
  const returned = isReturned(task);
  return (
    <article
      className={cx('kcard', fresh && 'w', needsMe && 'has-hook', returned && 'is-returned', needsMe && 'is-draggable', dragging && 'is-dragging', landed && 'is-landed')}
      data-card={task.id}
      draggable={needsMe}
      style={{ '--d': delay } as CSSProperties}
      {...(needsMe
        ? {
            ...dragProps,
            // Пока начинался перенос, курсор мог пройти над кнопкой: mouseleave с неё во время переноса не придёт.
            onDragStart(e: DragEvent) {
              onTarget(null);
              dragProps.onDragStart(e);
            },
          }
        : {})}
    >
      <span className="kfx" aria-hidden="true"></span>
      {needsMe && (
        <svg className="kc-hook" viewBox="0 0 20 34" aria-hidden="true">
          <path d="M10 0V14M6 14h8l-1 4H7zM10 18v3a4.5 4.5 0 1 1-4.5 4.5"></path>
        </svg>
      )}
      {/* draggable: тянется вся карточка, а не ссылка. */}
      <Link className="kopen" to={to} state={linkState} draggable={false}>
        <span className="vt" style={{ display: 'block', viewTransitionName: `floor-${task.id}` }}>
          {task.title}
        </span>
      </Link>
      <span className="kmeta">
        <Icon name={meta.icon} />
        {meta.text}
      </span>
      {returned && <ReturnedChip />}
      {needsMe && <MoveButtons moves={moves} onMove={onMove} onTarget={onTarget} />}
      {onAssign && (
        <span className="kacts">
          <button className="kassign" type="button" aria-haspopup="listbox" aria-label="Назначить исполнителя" disabled={assignBusy} onClick={(e) => onAssign(e.currentTarget)}>
            Назначить
            <Icon name="down" />
          </button>
        </span>
      )}
    </article>
  );
}
