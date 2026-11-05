import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, makeTask, manager, providers } from '../../test';
import type { FakeSupabase } from '../../test/fakeSupabase';
import { supabase } from '../../api/client';
import { movesFor } from '../../lib/status';
import type { BoardTask } from '../../api/types';
import { ReturnDialog } from './ReturnDialog';
import { useRequestMove } from './useRequestMove';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

describe('ReturnDialog', () => {
  it('пустой комментарий не отправляется, ошибка связана с полем', () => {
    const onConfirm = vi.fn();
    render(<ReturnDialog taskTitle="Ворота" onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Напишите, что нужно исправить: без комментария вернуть нельзя.');
    expect(screen.getByLabelText('Что нужно исправить')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Что нужно исправить')).toHaveAttribute('aria-describedby', 'bs-rcomment-err');
  });

  it.each(['   ', '\n\t'])('пробелы не считаются комментарием: %j', (text) => {
    const onConfirm = vi.fn();
    render(<ReturnDialog taskTitle="Ворота" onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Что нужно исправить'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('передаёт текст без лишних пробелов', () => {
    const onConfirm = vi.fn();
    render(<ReturnDialog taskTitle="Ворота" onConfirm={onConfirm} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Вернуть на доработку' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Что нужно исправить'), { target: { value: '  перекошены ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }));
    expect(onConfirm).toHaveBeenCalledWith('перекошены');
  });
});

describe('useRequestMove', () => {
  const task = makeTask({ status: 'review' });

  function Card({ item }: { item: BoardTask }) {
    const { requestMove, moveDialog } = useRequestMove();
    return (
      <>
        {movesFor(item, manager).map((move) => (
          <button key={move.to} onClick={() => requestMove(item, move)}>
            {move.short}
          </button>
        ))}
        {moveDialog}
      </>
    );
  }

  function setup() {
    const queryClient = createTestQueryClient();
    render(<Card item={task} />, { wrapper: providers({ me: manager, queryClient }) });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    fake.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('действие без комментария сразу открывает окно отмены', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Принять' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «Принята»');
  });

  it('возврат сначала спрашивает причину, она уходит в базу после окна отмены', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Что нужно исправить'), { target: { value: 'Перекошены' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Вернуть' }).at(-1) as HTMLElement);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «На доработке»');

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fake.rpc).toHaveBeenCalledWith('change_task_status', { p_task_id: 't1', p_to: 'rework', p_comment: 'Перекошены' });
  });

  it('потеря сети не теряет комментарий: окно открывается снова с тем же текстом (AC-18)', async () => {
    fake.respond('change_task_status', { error: { message: 'TypeError: Failed to fetch' }, status: 0 });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }));
    fireEvent.change(screen.getByLabelText('Что нужно исправить'), { target: { value: 'Длинный текст причины' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Вернуть' }).at(-1) as HTMLElement);

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Что нужно исправить')).toHaveValue('Длинный текст причины');
    expect(screen.getByRole('status')).toHaveTextContent('Нет связи с сервером');
  });
});
