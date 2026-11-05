import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, makeObject, makeTask, manager, otherWorker, providers, worker } from '../test';
import type { FakeSupabase } from '../test/fakeSupabase';
import { supabase } from './client';
import { useCreateObject, useCreateTask, useDeleteObject, useDeleteTask, useUpdateObject, useUpdateTask } from './mutations';
import { keys, useBoardTasks, useMyTasks, useMyTurnCount, useObject, useObjects, useObjectTasks, useProfiles, useReviewTasks, useTask, useTaskEvents } from './queries';
import type { BoardTask, ObjectRow } from './types';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const undoSpy = vi.hoisted(() => vi.fn());
vi.mock('../ui/UndoProvider/UndoProvider', async (original) => {
  const real = await original<typeof import('../ui/UndoProvider/UndoProvider')>();
  return { ...real, useUndo: () => undoSpy() ?? real.useUndo() };
});
const fake = supabase as unknown as FakeSupabase;

const tasks = [
  makeTask({ id: 't1', object_id: 'o1', assignee_id: worker.id, status: 'new' }),
  makeTask({ id: 't2', object_id: 'o1', assignee_id: worker.id, status: 'review' }),
  makeTask({ id: 't3', object_id: 'o2', assignee_id: otherWorker.id, status: 'review' }),
  makeTask({ id: 't4', object_id: 'o2', assignee_id: null, status: 'new' }),
  makeTask({ id: 't5', object_id: 'o2', assignee_id: worker.id, status: 'rework' }),
];

function hook<T>(callback: () => T, me = worker) {
  const queryClient = createTestQueryClient();
  return { queryClient, ...renderHook(callback, { wrapper: providers({ me, queryClient }) }) };
}

beforeEach(() => fake.reset());

describe('чтение', () => {
  beforeEach(() => fake.respond('task_board', { data: tasks }));

  it('списки читают вид task_board', async () => {
    const { result } = hook(() => useBoardTasks());
    await waitFor(() => expect(result.current.data).toHaveLength(5));
    expect(fake.from).toHaveBeenCalledWith('task_board');
    expect(fake.from).not.toHaveBeenCalledWith('tasks');
  });

  it.each<[string, () => { data?: BoardTask[] }, string[]]>([
    ['задачи объекта', () => useObjectTasks('o2'), ['t3', 't4', 't5']],
    ['мои задачи', () => useMyTasks(), ['t1', 't2', 't5']],
    ['ждут проверки', () => useReviewTasks(), ['t2', 't3']],
  ])('%s', async (_name, callback, ids) => {
    const { result } = hook(callback);
    await waitFor(() => expect(result.current.data?.map((t) => t.id)).toEqual(ids));
  });

  it.each([
    ['исполнитель: моя новая и моя доработка', worker, 2],
    ['другой исполнитель: его задача на проверке не ждёт его', otherWorker, 0],
    // Постановщик считает только задачи, где сам назначен.
    ['постановщик без своих задач', manager, 0],
  ])('счётчик вкладки: %s', async (_name, me, count) => {
    const { result } = hook(() => ({ count: useMyTurnCount(), board: useBoardTasks() }), me);
    await waitFor(() => expect(result.current.board.data).toBeDefined());
    expect(result.current.count).toBe(count);
  });

  it('нет данных: счётчик 0', () => {
    const { result } = hook(() => useMyTurnCount());
    expect(result.current).toBe(0);
  });

  it('задача: null, если скрыта правами или её нет', async () => {
    fake.respond('task_board', { data: null });
    const { result } = hook(() => useTask('t9'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(fake.calls('task_board')).toContainEqual({ target: 'task_board', method: 'eq', args: ['id', 't9'] });
  });

  it('задача сразу видна из загруженной доски, пока идёт запрос', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(keys.board, tasks);
    const { result } = renderHook(() => useTask('t2'), { wrapper: providers({ me: worker, queryClient }) });
    expect(result.current.data?.id).toBe('t2');
    expect(result.current.isPlaceholderData).toBe(true);
  });

  it('объект сразу виден из загруженного списка', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(keys.objectList, [makeObject()]);
    const { result } = renderHook(() => useObject('o1'), { wrapper: providers({ me: worker, queryClient }) });
    expect(result.current.data?.name).toBe('ЖК Северный');
  });

  it.each<[string, string, () => { data?: unknown }]>([
    ['объекты', 'objects', () => useObjects()],
    ['люди', 'profiles', () => useProfiles()],
    ['история', 'task_events', () => useTaskEvents('t1')],
  ])('%s читаются из своей таблицы', async (_name, table, callback) => {
    fake.respond(table, { data: [] });
    const { result } = hook(callback);
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(fake.from).toHaveBeenCalledWith(table);
  });

  it('история по задаче и по порядку', async () => {
    const { result } = hook(() => useTaskEvents('t7'));
    await waitFor(() => expect(result.current.data).toBeDefined());
    const methods = fake.calls('task_events').map((c) => [c.method, c.args[0]]);
    expect(methods).toEqual(expect.arrayContaining([['eq', 'task_id'], ['order', 'created_at'], ['order', 'id']]));
  });

  it('отказ базы приходит как ApiError без повторов', async () => {
    fake.respond('objects', { error: { code: '42501', message: 'permission denied' }, status: 403 });
    const { result } = hook(() => useObjects());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Это действие вам недоступно.');
    expect(fake.calls('objects').filter((c) => c.method === 'select')).toHaveLength(1);
  });
});

describe('мутации', () => {
  it('создание объекта передаёт только название и адрес', async () => {
    fake.respond('objects', { data: makeObject() });
    const { result, queryClient } = hook(() => useCreateObject());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await act(() => result.current.mutateAsync({ name: 'Склад', address: 'ул. Южная' }));
    expect(fake.calls('objects')[0]).toEqual({ target: 'objects', method: 'insert', args: [{ name: 'Склад', address: 'ул. Южная' }] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.objects });
  });

  it('правка объекта по id', async () => {
    fake.respond('objects', { data: makeObject() });
    const { result } = hook(() => useUpdateObject());
    await act(() => result.current.mutateAsync({ id: 'o1', name: 'Новое', address: 'Адрес' }));
    const calls = fake.calls('objects');
    expect(calls[0]).toEqual({ target: 'objects', method: 'update', args: [{ name: 'Новое', address: 'Адрес' }] });
    expect(calls[1]).toEqual({ target: 'objects', method: 'eq', args: ['id', 'o1'] });
  });

  it('создание задачи без status и author_id', async () => {
    fake.respond('tasks', { data: makeTask() });
    const { result, queryClient } = hook(() => useCreateTask());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const values = { object_id: 'o1', title: 'T', description: '', assignee_id: null };
    await act(() => result.current.mutateAsync(values));
    expect(fake.calls('tasks')[0]?.args).toEqual([values]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.tasks });
  });

  it('правка задачи обновляет задачу и историю даже при отказе', async () => {
    fake.respond('tasks', { error: { code: '23514', message: 'Снять исполнителя можно только у новой задачи.' }, status: 400 });
    const { result, queryClient } = hook(() => useUpdateTask());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 't1', patch: { assignee_id: null } })).rejects.toThrow('Снять исполнителя можно только у новой задачи.');
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.tasks });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.events('t1') });
  });

  it('мутация не повторяется', async () => {
    fake.respond('tasks', { error: { message: 'сеть' }, status: 0 });
    const { result } = hook(() => useUpdateTask());
    await act(() => result.current.mutateAsync({ id: 't1', patch: { title: 'X' } }).catch(() => undefined));
    expect(fake.calls('tasks').filter((c) => c.method === 'update')).toHaveLength(1);
  });

  it('удаление задачи: функция базы, запись уходит из кэша, открытая задача не перезапрашивается', async () => {
    const { result, queryClient } = hook(() => useDeleteTask());
    queryClient.setQueryData(keys.board, tasks);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await act(() => result.current.mutateAsync('t2'));
    expect(fake.rpc).toHaveBeenCalledWith('delete_task', { p_task_id: 't2' });
    expect(queryClient.getQueryData<BoardTask[]>(keys.board)?.map((t) => t.id)).not.toContain('t2');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.task('t2'), refetchType: 'none' });
  });

  it('удаление объекта убирает и его задачи', async () => {
    const { result, queryClient } = hook(() => useDeleteObject());
    queryClient.setQueryData(keys.board, tasks);
    queryClient.setQueryData(keys.objectList, [makeObject({ id: 'o1' }), makeObject({ id: 'o2' })]);
    await act(() => result.current.mutateAsync('o2'));
    expect(fake.rpc).toHaveBeenCalledWith('delete_object', { p_object_id: 'o2' });
    expect(queryClient.getQueryData<ObjectRow[]>(keys.objectList)?.map((o) => o.id)).toEqual(['o1']);
    expect(queryClient.getQueryData<BoardTask[]>(keys.board)?.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('отказ при удалении ничего не убирает', async () => {
    fake.respond('delete_task', { error: { code: '42501', message: 'Это действие доступно постановщику' }, status: 403 });
    const { result, queryClient } = hook(() => useDeleteTask());
    queryClient.setQueryData(keys.board, tasks);
    await act(async () => {
      await expect(result.current.mutateAsync('t2')).rejects.toThrow('Это действие доступно постановщику');
    });
    expect(queryClient.getQueryData<BoardTask[]>(keys.board)).toHaveLength(5);
  });
});

describe('удаление снимает ожидающую смену статуса', () => {
  function deleting<T>(callback: () => T) {
    const discard = vi.fn();
    undoSpy.mockReturnValue({ run: vi.fn(), discard });
    return { discard, ...hook(callback, manager) };
  }

  it('задача: снимает её действие', async () => {
    const { discard, result } = deleting(() => useDeleteTask());
    await act(() => result.current.mutateAsync('t1'));
    expect(discard).toHaveBeenCalledWith('t1');
  });

  it('объект: снимает действия всех его задач', async () => {
    const { discard, queryClient, result } = deleting(() => useDeleteObject());
    queryClient.setQueryData(keys.board, tasks);
    await act(() => result.current.mutateAsync('o1'));
    expect(discard.mock.calls.flat().sort()).toEqual(['t1', 't2']);
  });

  it('объект: карточки и история его задач помечены устаревшими', async () => {
    const { queryClient, result } = deleting(() => useDeleteObject());
    queryClient.setQueryData(keys.board, tasks);
    queryClient.setQueryData(keys.task('t1'), tasks[0]);
    queryClient.setQueryData(keys.events('t1'), []);
    await act(() => result.current.mutateAsync('o1'));
    expect(queryClient.getQueryState(keys.task('t1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.events('t1'))?.isInvalidated).toBe(true);
  });
});
