import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/errors';
import { EmptyState, ErrorState, LoadingState, NotFoundState, QueryState } from './States';

const query = (fields: { data?: string | null; error?: Error | null; isPending?: boolean }) =>
  ({ data: undefined, error: null, isPending: false, refetch: vi.fn(), ...fields }) as never;

describe('состояния', () => {
  it('загрузка объявляется диктору', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем…');
  });

  it('ошибка с повтором показывает только понятный текст', () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError('network', 'Нет связи')} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Нет связи');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('неизвестная ошибка без техники', () => {
    render(<ErrorState error={new Error('PGRST999 boom')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Что-то пошло не так');
    expect(screen.getByRole('alert')).not.toHaveTextContent('PGRST');
  });

  it('пусто и не найдено с действием', () => {
    render(
      <>
        <EmptyState icon="crane" title="Объектов пока нет" text="Добавьте первый" action={<button>Добавить</button>} />
        <NotFoundState />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Объектов пока нет' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Здесь ничего нет' })).toBeInTheDocument();
  });
});

describe('QueryState', () => {
  const content = (data: string) => <p>{data}</p>;

  it('загрузка', () => {
    render(<QueryState query={query({ isPending: true })}>{content}</QueryState>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('ошибка первой загрузки с повтором', () => {
    const q = query({ error: new ApiError('server', 'Сбой') });
    render(<QueryState query={q}>{content}</QueryState>);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect((q as unknown as { refetch: () => void }).refetch).toHaveBeenCalledTimes(1);
  });

  it('данные', () => {
    render(<QueryState query={query({ data: 'задача' })}>{content}</QueryState>);
    expect(screen.getByText('задача')).toBeInTheDocument();
  });

  it('ошибка фонового обновления не прячет показанные данные', () => {
    render(<QueryState query={query({ data: 'задача', error: new ApiError('network', 'Нет связи') })}>{content}</QueryState>);
    expect(screen.getByText('задача')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('не найдено: своё или общее', () => {
    const { rerender } = render(<QueryState query={query({ data: null })}>{content}</QueryState>);
    expect(screen.getByRole('heading', { name: 'Здесь ничего нет' })).toBeInTheDocument();
    rerender(
      <QueryState query={query({ data: null })} notFound={<p>Нет задачи</p>}>
        {content}
      </QueryState>,
    );
    expect(screen.getByText('Нет задачи')).toBeInTheDocument();
  });
});
