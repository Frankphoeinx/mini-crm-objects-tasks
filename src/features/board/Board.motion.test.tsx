// Перетаскивание и движение карточек. Времена фейковые: очередь отмены и волна считают миллисекунды.
import { act, createEvent, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/shared/api/client';
import { keys, type BoardTask, type Profile } from '@/shared/api';
import { makeObject, makeTask, manager, otherWorker, renderScreen, worker } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { ObjectBoard } from './ObjectBoard';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const col = (key: string) => document.querySelector<HTMLElement>(`.k-${key}`) as HTMLElement;
const card = (id = 't1') => document.querySelector<HTMLElement>(`[data-card="${id}"]`) as HTMLElement;
const dt = (dropEffect = 'none') => ({ dataTransfer: { dropEffect, effectAllowed: '', setData: vi.fn() } });

function show(tasks: BoardTask[], me: Profile = worker) {
  return renderScreen(<ObjectBoard objectId="o1" />, { me, tasks, objects: [makeObject()], profiles: [manager, worker, otherWorker] });
}

// В jsdom нет DragEvent: relatedTarget из параметров события теряется, задаём его сами.
function dragLeave(el: HTMLElement, relatedTarget: Element | null) {
  const event = createEvent.dragLeave(el);
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  fireEvent(el, event);
}

async function startDrag(id = 't1') {
  fireEvent.dragStart(card(id), dt());
  await advance(0);
}

const shownStatus = (queryClient: ReturnType<typeof show>['queryClient'], id = 't1') =>
  queryClient.getQueryData<BoardTask[]>(keys.board)?.find((t) => t.id === id)?.status;

beforeEach(() => {
  vi.useFakeTimers();
  fake.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Перетаскивание', () => {
  it('состояние меняется только со следующего тика: иначе браузер отменит перенос', async () => {
    show([makeTask({ status: 'work' })]);
    const data = dt();
    fireEvent.dragStart(card(), data);

    expect(data.dataTransfer.effectAllowed).toBe('move');
    expect(data.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 't1');
    expect(card()).not.toHaveClass('is-dragging');
    expect(col('work')).not.toHaveClass('is-source');

    await advance(0);
    expect(card()).toHaveClass('is-dragging');
    expect(col('work')).toHaveClass('is-source');
  });

  it.each([
    ['new', 'is-denied', true],
    ['work', 'is-source', true],
    ['review', 'is-allowed', false],
    ['accepted', 'is-denied', true],
  ])('колонка %s: класс %s, событие проходит мимо браузера: %s', async (key, cls, passes) => {
    show([makeTask({ status: 'work' })]);
    await startDrag();
    expect(col(key)).toHaveClass(cls);
    expect(fireEvent.dragEnter(col(key), dt())).toBe(passes);
    expect(fireEvent.dragOver(col(key), dt())).toBe(passes);
    expect(col(key)).toHaveClass('is-over');
  });

  it('разрешённая колонка отмечает перенос как move', async () => {
    show([makeTask({ status: 'work' })]);
    await startDrag();
    const data = dt();
    fireEvent.dragOver(col('review'), data);
    expect(data.dataTransfer.dropEffect).toBe('move');
  });

  it('разрешение действует сразу, ещё до следующего тика', () => {
    show([makeTask({ status: 'work' })]);
    fireEvent.dragStart(card(), dt());
    expect(fireEvent.dragOver(col('review'), dt())).toBe(false);
  });

  it('чужое перетаскивание (файл) доска не принимает', () => {
    show([makeTask({ status: 'work' })]);
    expect(fireEvent.dragOver(col('review'), dt())).toBe(true);
    expect(col('review')).not.toHaveClass('is-over');
  });

  it('уход из колонки снимает подсветку, переход внутрь колонки нет', async () => {
    show([makeTask({ status: 'work' })]);
    await startDrag();
    fireEvent.dragEnter(col('review'), dt());
    dragLeave(col('review'), col('review').querySelector('.col-h'));
    expect(col('review')).toHaveClass('is-over');
    dragLeave(col('review'), document.body);
    expect(col('review')).not.toHaveClass('is-over');
  });

  it('бросок в разрешённую: статус сменился, окно отмены открыто, классы сняты', async () => {
    const { queryClient } = show([makeTask({ status: 'work' })]);
    await startDrag();
    fireEvent.dragOver(col('review'), dt());
    fireEvent.dragEnd(card(), dt('move'));
    await advance(0);

    expect(shownStatus(queryClient)).toBe('review');
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(col('review')).not.toHaveClass('is-allowed');
    expect(col('review')).not.toHaveClass('is-over');
    expect(col('new')).not.toHaveClass('is-denied');

    await advance(10_000);
    expect(fake.rpc).toHaveBeenCalledWith('change_task_status', { p_task_id: 't1', p_to: 'review', p_comment: null });
  });

  it('браузер отменил бросок (dropEffect none): ничего не меняется и подсказки нет', async () => {
    const { queryClient } = show([makeTask({ status: 'work' })]);
    await startDrag();
    fireEvent.dragOver(col('review'), dt());
    fireEvent.dragEnd(card(), dt('none'));
    await advance(0);

    expect(shownStatus(queryClient)).toBe('work');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('запрещённая колонка: подсказка переживает dragleave, который браузер шлёт при отказе', async () => {
    const { queryClient } = show([makeTask({ status: 'work' })]);
    await startDrag();
    fireEvent.dragOver(col('accepted'), dt());
    dragLeave(col('accepted'), null);
    fireEvent.dragEnd(card(), dt('none'));

    expect(screen.getByRole('status')).toHaveTextContent('Так нельзя: из «В работе» задача идёт только в «На проверке».');
    expect(shownStatus(queryClient)).toBe('work');
  });

  it('вернулся в свою колонку: подсказки нет', async () => {
    show([makeTask({ status: 'work' })]);
    await startDrag();
    fireEvent.dragOver(col('accepted'), dt());
    fireEvent.dragOver(col('work'), dt());
    fireEvent.dragEnd(card(), dt('none'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ни над одной колонкой не был: подсказки нет', async () => {
    show([makeTask({ status: 'work' })]);
    await startDrag();
    fireEvent.dragEnd(card(), dt('none'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('бросок в «На доработке» открывает окно возврата, статус пока прежний', async () => {
    const { queryClient } = show([makeTask({ status: 'review' })], manager);
    await startDrag();
    fireEvent.dragOver(col('rework'), dt());
    fireEvent.dragEnd(card(), dt('move'));
    await advance(0);

    expect(screen.getByRole('dialog', { name: 'Вернуть на доработку' })).toBeInTheDocument();
    expect(shownStatus(queryClient)).toBe('review');
  });

  it('исполнитель: задача доработки тянется из «Новой» в «В работе»', async () => {
    const { queryClient } = show([makeTask({ status: 'rework', return_count: 1 })]);
    await startDrag();
    expect(col('new')).toHaveClass('is-source');
    expect(col('work')).toHaveClass('is-allowed');
    fireEvent.dragOver(col('work'), dt());
    fireEvent.dragEnd(card(), dt('move'));
    await advance(0);
    expect(shownStatus(queryClient)).toBe('work');
  });

  it('dragend сразу после dragstart: подсветка не залипает', () => {
    show([makeTask({ status: 'work' })]);
    fireEvent.dragStart(card(), dt());
    fireEvent.dragEnd(card(), dt());
    act(() => vi.advanceTimersByTime(0));
    expect(col('work')).not.toHaveClass('is-source');
  });

  it('карточку перенесла фоновая загрузка: подсветка не залипает без dragend', async () => {
    const { queryClient } = show([makeTask({ status: 'work' })]);
    await startDrag();
    act(() => queryClient.setQueryData<BoardTask[]>(keys.board, [makeTask({ status: 'review' })]));
    await advance(0);
    expect(col('work')).not.toHaveClass('is-source');
    expect(col('new')).not.toHaveClass('is-denied');
  });

  it('карточка без действий не начинает перенос даже от перетаскивания текста', () => {
    show([makeTask({ status: 'accepted' })]);
    fireEvent.dragStart(card(), dt());
    act(() => vi.advanceTimersByTime(0));
    expect(col('accepted')).not.toHaveClass('is-source');
    expect(fireEvent.dragOver(col('new'), dt())).toBe(true);
  });
});

describe('Плавный перенос', () => {
  const animate = vi.fn();
  let reduced = false;
  // Раскладка: колонки через 100 px, карточки через 50 px. jsdom сам ничего не считает.
  let columnStep = 100;

  beforeEach(() => {
    reduced = false;
    columnStep = 100;
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reduced }) });
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('col') ? [...(this.parentElement?.children ?? [])].indexOf(this) * columnStep : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.card ? [...(this.parentElement?.children ?? [])].indexOf(this) * 50 : 0;
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(window, 'matchMedia');
  });

  const twoNew = () => [makeTask({ id: 'a', title: 'Первая' }), makeTask({ id: 'b', title: 'Вторая' })];
  const press = async (id: string, name: string) => {
    fireEvent.click(within(card(id)).getByRole('button', { name }));
    await advance(0);
  };
  const callOf = (el: HTMLElement) => {
    const i = animate.mock.contexts.indexOf(el);
    return i < 0 ? undefined : animate.mock.calls[i];
  };

  it('перенесённая карточка поднимается и садится за 340 мс, сосед съезжает за 260 мс', async () => {
    show(twoNew());
    await press('a', 'Взять в работу');

    expect(callOf(card('a'))).toEqual([
      [
        { transform: 'translate(-100px,0px)' },
        { transform: 'translate(-62px,-14px) rotate(-1.2deg) scale(1.03)', offset: 0.26 },
        { transform: 'none' },
      ],
      { duration: 340, easing: 'cubic-bezier(.16,1,.3,1)' },
    ]);
    expect(callOf(card('b'))).toEqual([[{ transform: 'translate(0px,50px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }]);
  });

  it('«Отменить» ведёт карточку обратно', async () => {
    show([makeTask()]);
    await press('t1', 'Взять в работу');
    animate.mockClear();
    // После отмены кэш сверяется с базой: она отдаёт задачу в прежнем статусе.
    fake.respond('task_board', { data: [makeTask()] });
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await advance(0);
    expect(callOf(card())?.[1]).toEqual({ duration: 340, easing: 'cubic-bezier(.16,1,.3,1)' });
    expect(callOf(card())?.[0][0]).toEqual({ transform: 'translate(100px,0px)' });
  });

  it('prefers-reduced-motion: без движения', async () => {
    reduced = true;
    show(twoNew());
    await press('a', 'Взять в работу');
    expect(card('a').parentElement?.parentElement).toHaveClass('k-work');
    expect(animate).not.toHaveBeenCalled();
  });

  it('первый показ не анимируется', () => {
    show(twoNew());
    expect(animate).not.toHaveBeenCalled();
  });

  it('смена размера окна не двигает доску при наведении, но замер обновляется', async () => {
    show([makeTask()]);
    columnStep = 200;
    fireEvent.mouseEnter(within(card()).getByRole('button', { name: 'Взять в работу' }));
    expect(animate).not.toHaveBeenCalled();

    await press('t1', 'Взять в работу');
    expect(callOf(card())?.[0][0]).toEqual({ transform: 'translate(-200px,0px)' });
  });

  it('новая карточка приходит без переноса', async () => {
    const { queryClient } = show([makeTask({ id: 'a' })]);
    act(() => queryClient.setQueryData<BoardTask[]>(keys.board, [makeTask({ id: 'a' }), makeTask({ id: 'b' })]));
    await advance(0);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('Волна и посадка', () => {
  it('волна только при первом показе и у новых карточек', async () => {
    const { queryClient } = show([makeTask({ id: 'a' })]);
    expect(card('a')).toHaveClass('w');
    await advance(400);
    expect(card('a')).not.toHaveClass('w');

    act(() => queryClient.setQueryData<BoardTask[]>(keys.board, [makeTask({ id: 'a' }), makeTask({ id: 'b' })]));
    await advance(0);
    expect(card('b')).toHaveClass('w');
    expect(card('a')).not.toHaveClass('w');
  });

  it('перенесённая карточка не идёт волной заново, но отмечена посадкой на 900 мс', async () => {
    show([makeTask()]);
    await advance(400);
    fireEvent.click(within(card()).getByRole('button', { name: 'Взять в работу' }));
    await advance(0);

    expect(col('work')).toContainElement(card());
    expect(card()).not.toHaveClass('w');
    expect(card()).toHaveClass('is-landed');
    await advance(900);
    expect(card()).not.toHaveClass('is-landed');
  });
});
