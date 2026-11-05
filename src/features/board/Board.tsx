import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { useMe, userMessage, useUpdateTask, type BoardTask, type Profile, type TaskStatus } from '@/shared/api';
import { buildBoard, canAssign, canClearAssignee, movesFor, paths, taskLinkState, type Move, type TaskFrom } from '@/shared/lib';
import { ERROR_TOAST_MS, Icon, personOptions, Picker, Roll, useMoveFlash, useRequestMove, useToast } from '@/shared/ui';
import { BoardCard, cx, type CardMeta } from './BoardCard';
import { useCardDrag } from './useCardDrag';
import { useCardFlip } from './useCardFlip';

const WAVE_MS = 400;

/** Волна только у карточек, впервые показанных на этом экране: перенесённая карточка летит сама. */
function useSeenCards(tasks: BoardTask[]) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const fresh = tasks
    .filter((t) => !seen.has(t.id))
    .map((t) => t.id)
    .join(' ');
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setSeen((prev) => new Set([...prev, ...fresh.split(' ')])), WAVE_MS);
    return () => clearTimeout(timer);
  }, [fresh]);
  return seen;
}

type BoardProps = {
  tasks: BoardTask[];
  /** Откуда открывается задача: от этого зависят кнопка «назад» и вкладка. */
  from: TaskFrom;
  /** Строка под названием: исполнитель на объекте, объект в «Моих задачах». */
  metaOf: (task: BoardTask) => CardMeta;
  /** Кнопка «Создать задачу» в колонке «Новая». */
  onAdd?: () => void;
  /** Кого можно назначить кнопкой «Назначить». Нет списка: кнопки нет. */
  people?: Profile[];
};

/** Доска для страницы объекта и «Моих задач»: колонки, карточки, перетаскивание, кнопки. */
export function Board({ tasks, from, metaOf, onAdd, people }: BoardProps) {
  const me = useMe();
  const navigate = useNavigate();
  const flash = useMoveFlash();
  const { showToast } = useToast();
  const { requestMove, moveDialog } = useRequestMove();
  const assign = useUpdateTask();
  const [target, setTarget] = useState<TaskStatus | null>(null);
  const [assigning, setAssigning] = useState<{ task: BoardTask; anchor: HTMLElement } | null>(null);
  const seen = useSeenCards(tasks);

  // Кнопка уезжает вместе с карточкой, и mouseleave с неё уже не придёт.
  function move(task: BoardTask, chosen: Move) {
    setTarget(null);
    requestMove(task, chosen);
  }

  const drag = useCardDrag(tasks, me.role, move);
  const columns = buildBoard(tasks, me.role);
  const layout = columns.map((col) => col.tasks.map((t) => t.id).join()).join('|');
  const boardRef = useCardFlip(layout);

  // Окно возврата отдаёт фокус кнопке, которая тут же уезжает с карточкой: blur с неё не придёт.
  const [targetLayout, setTargetLayout] = useState(layout);
  if (layout !== targetLayout) {
    setTargetLayout(layout);
    setTarget(null);
  }

  return (
    <div className="tile board-tile w" style={{ '--d': '50ms' } as CSSProperties}>
      <div className="board-box">
        <section className="board" aria-label="Доска задач" ref={boardRef}>
          {columns.map((col, ci) => {
            const add = col.key === 'new' ? onAdd : undefined;
            const hasTurn = !!add || col.tasks.some((t) => movesFor(t, me).length > 0);
            return (
              <div
                key={col.key}
                className={cx('col', `k-${col.key}`, drag.columnClass(col.key), target === col.key && 'is-target', hasTurn ? 'has-turn' : col.tasks.length === 0 && 'is-none')}
                {...drag.columnProps(col.key)}
              >
                <div className="col-h">
                  <Icon name={col.key} />
                  <span>{col.label}</span>
                  <span className="col-n">
                    <Roll value={col.tasks.length} />
                  </span>
                </div>
                <div className="col-b">
                  {add && (
                    <button className="col-add" type="button" onClick={add}>
                      <Icon name="plus" />
                      Создать задачу
                    </button>
                  )}
                  {col.tasks.length === 0 && (
                    <div className="col-empty">
                      <Icon name={col.key} />
                      Пусто
                    </div>
                  )}
                  {col.tasks.map((task, j) => {
                    const moves = movesFor(task, me);
                    return (
                      <BoardCard
                        key={task.id}
                        task={task}
                        meta={metaOf(task)}
                        moves={moves}
                        fresh={!seen.has(task.id)}
                        delay={`${Math.min(ci * 20 + j * 25, 150)}ms`}
                        dragging={drag.draggingId === task.id}
                        landed={flash.taskId === task.id}
                        dragProps={drag.cardProps(task, moves)}
                        onOpen={() => navigate(paths.task(task.id), { state: taskLinkState(from) })}
                        onMove={(chosen) => move(task, chosen)}
                        onTarget={setTarget}
                        onAssign={people && canAssign(task, me) ? (anchor) => setAssigning({ task, anchor }) : undefined}
                        assignBusy={assign.isPending && assign.variables.id === task.id}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>
      {moveDialog}
      {assigning && people && (
        <Picker
          anchor={assigning.anchor}
          value=""
          options={personOptions(people, canClearAssignee(assigning.task.status))}
          onPick={(id) => {
            if (id) assign.mutate({ id: assigning.task.id, patch: { assignee_id: id } }, { onError: (error) => showToast(userMessage(error), ERROR_TOAST_MS) });
          }}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}
