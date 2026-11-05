import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeSupabase } from '../test/fakeSupabase';
import { createTestQueryClient, makeTask, manager, providers, worker } from '../test';
import { supabase } from './client';
import { useMoveTask } from './moves';
import { keys } from './queries';
import type { BoardTask, TaskEvent } from './types';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

const event: TaskEvent = {
  id: 1,
  task_id: 't1',
  kind: 'created',
  actor_id: manager.id,
  from_status: null,
  to_status: null,
  comment: null,
  field: null,
  old_value: null,
  new_value: null,
  created_at: '2026-11-03T09:10:00Z',
};

function setup(task: BoardTask, me = worker) {
  const queryClient: QueryClient = createTestQueryClient();
  queryClient.setQueryData(keys.board, [task]);
  queryClient.setQueryData(keys.task(task.id), task);
  queryClient.setQueryData(keys.events(task.id), [event]);
  const view = renderHook(() => useMoveTask(), { wrapper: providers({ me, queryClient }) });
  const shown = () => queryClient.getQueryData<BoardTask[]>(keys.board)?.[0];
  const detail = () => queryClient.getQueryData<BoardTask>(keys.task(task.id));
  const history = () => queryClient.getQueryData<TaskEvent[]>(keys.events(task.id)) ?? [];
  return { ...view, queryClient, shown, detail, history };
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('useMoveTask: окно отмены на настоящем кэше', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('показ меняется сразу, в базу уходит ровно через 10 секунд', async () => {
    const t = setup(makeTask({ status: 'new' }));
    act(() => t.result.current(makeTask({ status: 'new' }), 'work', { comment: '  начал  ' }));

    expect(t.shown()?.status).toBe('work');
    expect(t.detail()?.status).toBe('work');
    expect(t.history().at(-1)).toMatchObject({ kind: 'status', from_status: 'new', to_status: 'work', comment: 'начал', actor_id: worker.id });
    expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «В работе»');

    await advance(9_999);
    expect(fake.rpc).not.toHaveBeenCalled();

    await advance(1);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith('change_task_status', { p_task_id: 't1', p_to: 'work', p_comment: 'начал' });
    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
  });

  it('«Отменить» возвращает показ, база ничего не получает', async () => {
    const t = setup(makeTask({ status: 'new' }));
    act(() => t.result.current(makeTask({ status: 'new' }), 'work'));
    await advance(5_000);

    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(t.shown()?.status).toBe('new');
    expect(t.detail()?.status).toBe('new');
    expect(t.history()).toEqual([event]);
    await advance(20_000);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('новое действие сразу отправляет предыдущее', async () => {
    const first = makeTask({ status: 'new' });
    const t = setup(first);
    act(() => t.result.current(first, 'work'));
    await advance(3_000);

    const second = t.shown() as BoardTask;
    act(() => t.result.current(second, 'review'));
    await advance(0);

    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenLastCalledWith('change_task_status', { p_task_id: 't1', p_to: 'work', p_comment: null });
    expect(t.shown()?.status).toBe('review');
    expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «На проверке»');

    await advance(10_000);
    expect(fake.rpc).toHaveBeenCalledTimes(2);
    expect(fake.rpc).toHaveBeenLastCalledWith('change_task_status', { p_task_id: 't1', p_to: 'review', p_comment: null });
  });

  it('отказ базы откатывает показ и выводит её текст', async () => {
    fake.respond('change_task_status', {
      error: { code: 'P0001', message: 'Так нельзя: из «На проверке» задача идёт только в «Принята» или «На доработке».' },
      status: 400,
    });
    const onRefused = vi.fn();
    const task = makeTask({ status: 'review' });
    const t = setup(task, manager);
    act(() => t.result.current(task, 'accepted', { onRefused }));
    await advance(10_000);

    expect(t.shown()?.status).toBe('review');
    expect(t.history()).toEqual([event]);
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Так нельзя: из «На проверке» задача идёт только в «Принята» или «На доработке».');
  });

  it('потеря сети откатывает показ понятным текстом', async () => {
    fake.respond('change_task_status', { error: { message: 'TypeError: Failed to fetch' }, status: 0 });
    const task = makeTask({ status: 'new' });
    const t = setup(task);
    act(() => t.result.current(task, 'work'));
    await advance(10_000);

    expect(t.shown()?.status).toBe('new');
    expect(screen.getByRole('status')).toHaveTextContent('Нет связи с сервером');
    expect(screen.getByRole('status')).not.toHaveTextContent('Failed to fetch');
  });

  it('возврат на доработку сразу показывает второй круг, отмена его снимает', async () => {
    const task = makeTask({ status: 'review' });
    const t = setup(task, manager);
    act(() => t.result.current(task, 'rework', { comment: 'Ворота перекошены' }));

    expect(t.shown()).toMatchObject({ status: 'rework', return_count: 1, last_return_comment: 'Ворота перекошены', last_return_by: manager.id });

    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(t.shown()).toMatchObject({ status: 'review', return_count: 0, last_return_comment: null, last_return_by: null, last_return_at: null });
  });

  it('фоновая загрузка в окне отмены не возвращает старый статус', async () => {
    const task = makeTask({ status: 'new' });
    const t = setup(task);
    act(() => t.result.current(task, 'work'));

    // Так выглядит возврат на вкладку: база ещё не знает о смене статуса.
    const fetchBoard = vi.fn(async () => [task]);
    await act(() => t.queryClient.fetchQuery({ queryKey: keys.board, queryFn: fetchBoard, staleTime: 0 }));
    await act(() => t.queryClient.fetchQuery({ queryKey: keys.events(task.id), queryFn: async () => [event], staleTime: 0 }));

    expect(fetchBoard).toHaveBeenCalledTimes(1);
    expect(t.shown()?.status).toBe('work');
    expect(t.history().at(-1)?.to_status).toBe('work');
    expect(t.history()).toHaveLength(2);
  });

  it('повторная загрузка не задваивает строку истории', async () => {
    const task = makeTask({ status: 'new' });
    const t = setup(task);
    act(() => t.result.current(task, 'work'));
    await act(() => t.queryClient.fetchQuery({ queryKey: keys.board, queryFn: async () => [task], staleTime: 0 }));
    expect(t.history()).toHaveLength(2);
  });

  it('отмена, потом фоновая загрузка: снятое действие не возвращается', async () => {
    const task = makeTask({ status: 'new' });
    const t = setup(task);
    act(() => t.result.current(task, 'work'));
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await act(() => t.queryClient.fetchQuery({ queryKey: keys.board, queryFn: async () => [task], staleTime: 0 }));
    expect(t.shown()?.status).toBe('new');
    expect(t.history()).toEqual([event]);
  });

  it('уход пользователя в окне отмены: статус не меняется (допущение из docs/05)', async () => {
    const task = makeTask({ status: 'new' });
    const t = setup(task);
    act(() => t.result.current(task, 'work'));
    t.unmount();
    await advance(20_000);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('после успеха показ сверяется с базой', async () => {
    const task = makeTask({ status: 'new' });
    const t = setup(task);
    const invalidate = vi.spyOn(t.queryClient, 'invalidateQueries');
    act(() => t.result.current(task, 'work'));
    await advance(10_000);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.tasks });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.events('t1') });
  });
});
