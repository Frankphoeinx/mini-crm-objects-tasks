import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createTestQueryClient } from '../../test';
import { useMoveFlash, UndoProvider, useToast, useUndo, type UndoAction } from './index';

let run: (action: UndoAction) => void;
let discard: (key: string) => void;
let undo: () => void;
let showToast: (text: string, ms?: number) => void;
let flash: () => string;

function setup() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <UndoProvider>{children}</UndoProvider>
    </QueryClientProvider>
  );
  const view = renderHook(() => ({ ...useUndo(), ...useToast(), flash: useMoveFlash() }), { wrapper });
  run = (action) => view.result.current.run(action);
  discard = (key) => view.result.current.discard(key);
  undo = () => fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
  showToast = (text, ms) => view.result.current.showToast(text, ms);
  flash = () => `${view.result.current.flash.to ?? '-'}/${view.result.current.flash.taskId ?? '-'}`;
  return { ...view, queryClient };
}

function makeAction<T extends Partial<UndoAction> = object>(fields?: T) {
  return {
    key: 't1',
    text: 'Задача теперь «В работе»',
    apply: vi.fn(),
    revert: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
    settle: vi.fn(),
    onRefused: vi.fn(),
    ...fields,
  };
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const undoButton = () => screen.queryByRole('button', { name: 'Отменить' });

describe('UndoProvider (AC-12)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('истечение: показ сразу, в базу на десятой секунде, окно закрывается', async () => {
    setup();
    const action = makeAction();
    act(() => run(action));

    expect(action.apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «В работе»');
    expect(undoButton()).toBeInTheDocument();

    await advance(9_999);
    expect(action.commit).not.toHaveBeenCalled();
    expect(undoButton()).toBeInTheDocument();

    await advance(1);
    expect(action.commit).toHaveBeenCalledTimes(1);
    expect(action.revert).not.toHaveBeenCalled();
    expect(action.settle).toHaveBeenCalledTimes(1);
    expect(undoButton()).not.toBeInTheDocument();
  });

  it('отмена: показ возвращается, в базу не уходит никогда', async () => {
    setup();
    const action = makeAction();
    act(() => run(action));
    await advance(4_000);

    fireEvent.click(undoButton() as HTMLElement);

    expect(action.revert).toHaveBeenCalledTimes(1);
    expect(action.settle).toHaveBeenCalledTimes(1);
    expect(undoButton()).not.toBeInTheDocument();
    await advance(30_000);
    expect(action.commit).not.toHaveBeenCalled();
  });

  it('второе действие: первое уходит сразу, у второго свои полные 10 секунд', async () => {
    setup();
    const first = makeAction();
    const second = makeAction({ key: 't2', text: 'Задача теперь «Принята»' });
    act(() => run(first));
    await advance(6_000);
    act(() => run(second));
    await advance(0);

    expect(first.commit).toHaveBeenCalledTimes(1);
    expect(second.apply).toHaveBeenCalledTimes(1);
    expect(second.commit).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «Принята»');

    await advance(9_999);
    expect(second.commit).not.toHaveBeenCalled();
    await advance(1);
    expect(second.commit).toHaveBeenCalledTimes(1);
    expect(first.commit).toHaveBeenCalledTimes(1);
  });

  it('второе действие не обгоняет первое по пути в базу', async () => {
    setup();
    const order: string[] = [];
    let finishFirst = () => {};
    const first = makeAction({
      commit: vi.fn(() => {
        order.push('первое начато');
        return new Promise<void>((resolve) => {
          finishFirst = () => {
            order.push('первое готово');
            resolve();
          };
        });
      }),
    });
    const second = makeAction({
      key: 't2',
      commit: vi.fn(() => {
        order.push('второе начато');
        return Promise.resolve();
      }),
    });
    const third = makeAction({ key: 't3' });

    act(() => run(first));
    act(() => run(second));
    act(() => run(third));
    await advance(0);
    expect(order).toEqual(['первое начато']);

    await act(async () => finishFirst());
    expect(order).toEqual(['первое начато', 'первое готово', 'второе начато']);
  });

  it('новая смена перезапускает полосу отсчёта', () => {
    setup();
    act(() => run(makeAction()));
    const first = document.querySelector('.undo-bar')?.className;
    act(() => run(makeAction({ key: 't2' })));
    const second = document.querySelector('.undo-bar')?.className;
    expect(first).toContain('is-odd');
    expect(second).toContain('is-even');
  });

  it('отказ базы: показ откатывается, виден её текст, ввод возвращается', async () => {
    setup();
    const error = new ApiError('refused', 'Это может сделать только назначенный исполнитель', '42501', 403);
    const action = makeAction({ commit: vi.fn(() => Promise.reject(error)) });
    act(() => run(action));
    await advance(10_000);

    expect(action.revert).toHaveBeenCalledTimes(1);
    expect(action.settle).toHaveBeenCalledTimes(1);
    expect(action.onRefused).toHaveBeenCalledWith(error);
    expect(screen.getByRole('status')).toHaveTextContent('Это может сделать только назначенный исполнитель');
  });

  it('незнакомая ошибка: общий текст без техники', async () => {
    setup();
    act(() => run(makeAction({ commit: vi.fn(() => Promise.reject(new TypeError('x is not a function'))) })));
    await advance(10_000);
    expect(screen.getByRole('status')).toHaveTextContent('Что-то пошло не так. Попробуйте ещё раз.');
  });

  it('отказ первого снимает зависимое действие над той же записью', async () => {
    setup();
    const calls: string[] = [];
    const first = makeAction({ commit: vi.fn(() => Promise.reject(new ApiError('refused', 'Так нельзя'))), revert: vi.fn(() => calls.push('откат первого')) });
    const second = makeAction({ revert: vi.fn(() => calls.push('откат второго')) });
    act(() => run(first));
    act(() => run(second));
    await advance(0);

    expect(calls).toEqual(['откат второго', 'откат первого']);
    expect(undoButton()).not.toBeInTheDocument();
    await advance(20_000);
    expect(second.commit).not.toHaveBeenCalled();
  });

  it('отказ первого не трогает действие над другой записью', async () => {
    setup();
    const first = makeAction({ commit: vi.fn(() => Promise.reject(new ApiError('refused', 'Так нельзя'))) });
    const second = makeAction({ key: 't2' });
    act(() => run(first));
    act(() => run(second));
    await advance(0);

    expect(second.revert).not.toHaveBeenCalled();
    expect(undoButton()).toBeInTheDocument();
    await advance(10_000);
    expect(second.commit).toHaveBeenCalledTimes(1);
  });

  it('после отказа очередь работает дальше', async () => {
    setup();
    act(() => run(makeAction({ commit: vi.fn(() => Promise.reject(new ApiError('refused', 'Так нельзя'))) })));
    await advance(10_000);
    const next = makeAction({ key: 't2' });
    act(() => run(next));
    await advance(10_000);
    expect(next.commit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['отмены', () => fireEvent.click(undoButton() as HTMLElement), () => Promise.resolve()],
    ['отказа базы', () => {}, () => Promise.reject(new ApiError('refused', 'Так нельзя'))],
  ])('после %s снятое действие не возвращается с фоновой загрузкой', async (_name, finish, commit) => {
    const { queryClient } = setup();
    const action = makeAction({ commit: vi.fn(commit) });
    act(() => run(action));
    finish();
    await advance(10_000);
    vi.mocked(action.apply).mockClear();

    await act(() => queryClient.fetchQuery({ queryKey: ['tasks'], queryFn: async () => [], staleTime: 0 }));
    expect(action.apply).not.toHaveBeenCalled();
  });

  it('первый отказал, когда второй уже ждал очереди: второй в базу не идёт, откат с последнего шага', async () => {
    setup();
    const order: string[] = [];
    let refuse: (error: unknown) => void = () => {};
    const first = makeAction({
      commit: vi.fn(() => new Promise<void>((_, reject) => { refuse = reject; })),
      revert: vi.fn(() => order.push('первый')),
    });
    const second = makeAction({ revert: vi.fn(() => order.push('второй')) });
    act(() => run(first));
    act(() => run(second));
    await advance(10_000);
    await act(async () => refuse(new ApiError('refused', 'Нельзя')));
    await advance(0);
    expect(second.commit).not.toHaveBeenCalled();
    expect(order).toEqual(['второй', 'первый']);
    expect(second.onRefused).toHaveBeenCalledTimes(1);
  });

  it('«Отменить» сообщает о снятии: ввод можно вернуть', () => {
    setup();
    const action = makeAction({ onUndone: vi.fn() });
    act(() => run(action));
    undo();
    expect(action.onUndone).toHaveBeenCalledTimes(1);
    expect(action.onRefused).not.toHaveBeenCalled();
  });

  it('запись удалена: её действие снимается без запроса в базу и без отката', async () => {
    setup();
    const action = makeAction();
    act(() => run(action));
    act(() => discard('t1'));
    expect(screen.queryByRole('button', { name: 'Отменить' })).toBeNull();
    await advance(10_000);
    expect(action.commit).not.toHaveBeenCalled();
    expect(action.revert).not.toHaveBeenCalled();
  });

  it('удаление другой записи окно отмены не трогает', () => {
    setup();
    act(() => run(makeAction()));
    act(() => discard('t2'));
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeTruthy();
  });

  it('фоновая загрузка возвращает неподтверждённое действие поверх новых данных', async () => {
    const { queryClient } = setup();
    const action = makeAction();
    act(() => run(action));
    vi.mocked(action.apply).mockClear();

    await act(() => queryClient.fetchQuery({ queryKey: ['tasks'], queryFn: async () => [], staleTime: 0 }));
    expect(action.apply).toHaveBeenCalledTimes(1);

    // Своя запись в кэш не считается загрузкой: иначе apply вызывал бы сам себя.
    act(() => queryClient.setQueryData(['tasks'], []));
    expect(action.apply).toHaveBeenCalledTimes(1);
  });

  it('пока база отвечает, действие остаётся на экране и после фоновой загрузки', async () => {
    const { queryClient } = setup();
    let finish = () => {};
    const action = makeAction({
      commit: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    act(() => run(action));
    await advance(10_000);
    vi.mocked(action.apply).mockClear();

    await act(() => queryClient.fetchQuery({ queryKey: ['tasks'], queryFn: async () => [], staleTime: 0 }));
    expect(action.apply).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    vi.mocked(action.apply).mockClear();
    await act(() => queryClient.fetchQuery({ queryKey: ['tasks2'], queryFn: async () => [], staleTime: 0 }));
    expect(action.apply).not.toHaveBeenCalled();
  });

  it('размонтирование: неотправленное не уходит в базу', async () => {
    const { unmount } = setup();
    const action = makeAction();
    act(() => run(action));
    unmount();
    await advance(20_000);
    expect(action.commit).not.toHaveBeenCalled();
  });

  it('вспышка статуса живёт 900 мс, после отмены остаётся только посадка карточки', async () => {
    setup();
    act(() => run(makeAction({ flash: { to: 'accepted', taskId: 't1' } })));
    expect(flash()).toBe('accepted/t1');
    await advance(900);
    expect(flash()).toBe('-/-');

    act(() => run(makeAction({ flash: { to: 'work', taskId: 't1' } })));
    fireEvent.click(undoButton() as HTMLElement);
    expect(flash()).toBe('-/t1');
    await advance(900);
    expect(flash()).toBe('-/-');
  });

  it('подсказка пропадает сама и стоит после окна отмены', async () => {
    setup();
    act(() => run(makeAction()));
    act(() => showToast('Так нельзя'));
    const toasts = document.querySelectorAll('.toast');
    expect(toasts[0]).toHaveClass('undo');
    expect(toasts[1]).toHaveTextContent('Так нельзя');

    await advance(3_400);
    expect(screen.queryByText('Так нельзя')).not.toBeInTheDocument();
  });
});
