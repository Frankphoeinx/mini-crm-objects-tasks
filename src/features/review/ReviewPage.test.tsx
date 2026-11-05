import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/shared/api/client';
import { makeObject, makeTask, manager, otherWorker, renderScreen, worker } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { ReviewPage } from './ReviewPage';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

function Where() {
  const { pathname, state } = useLocation();
  return <span data-testid="where">{`${pathname} ${JSON.stringify(state)}`}</span>;
}

const where = () => screen.getByTestId('where');
const first = makeTask({ id: 't1', title: 'Ворота', status: 'review' });
const second = makeTask({ id: 't2', title: 'Кровля', status: 'review', object_id: 'o2', assignee_id: otherWorker.id, return_count: 1 });
const hidden = makeTask({ id: 't3', title: 'Новая задача', status: 'new' });

function renderPage(options: Parameters<typeof renderScreen>[1] = {}) {
  return renderScreen(
    <>
      <ReviewPage />
      <Where />
    </>,
    {
      tasks: [first, second, hidden],
      objects: [makeObject(), makeObject({ id: 'o2', name: 'Склад' })],
      profiles: [manager, worker, otherWorker],
      ...options,
    },
  );
}

// Кэш запросов сообщает экрану об изменении нулевым таймером; при поддельных часах такой таймер, поставленный внутри другого, срабатывает через 1 мс.
const flush = () => act(() => vi.advanceTimersByTimeAsync(1));
const row = (title: string) => screen.getByRole('button', { name: title }).closest('article') as HTMLElement;

beforeEach(() => fake.reset());

describe('строки', () => {
  it('только задачи на проверке: название, объект, исполнитель, волна', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Ждут проверки' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText('Новая задача')).not.toBeInTheDocument();

    expect(row('Ворота')).toHaveTextContent('ЖК Северный');
    expect(row('Ворота')).toHaveTextContent('Пётр');
    expect(row('Кровля')).toHaveTextContent('Склад');
    expect(row('Кровля')).toHaveTextContent('Сергей');
    expect(row('Ворота')).toHaveClass('w');
    expect(row('Кровля').style.getPropertyValue('--d')).toBe('25ms');
  });

  it('второй круг: метка «Доработка» и тёплый вид, у первого круга их нет', () => {
    renderPage();
    expect(within(row('Кровля')).getByText('Доработка')).toBeInTheDocument();
    expect(row('Кровля')).toHaveClass('is-returned');
    expect(within(row('Ворота')).queryByText('Доработка')).not.toBeInTheDocument();
    expect(row('Ворота')).not.toHaveClass('is-returned');
  });

  it('без исполнителя в строке «Не назначен»', () => {
    renderPage({ tasks: [makeTask({ title: 'Ворота', status: 'review', assignee_id: null })] });
    expect(row('Ворота')).toHaveTextContent('Не назначен');
  });

  it('строка открывает задачу, «назад» потом вернёт на проверку', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Ворота' }));
    expect(where()).toHaveTextContent('/tasks/t1 {"from":"review"}');
  });

  it('«Все объекты» ведёт к списку', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Все объекты' }));
    expect(where()).toHaveTextContent('/objects');
  });
});

describe('действия', () => {
  afterEach(() => vi.useRealTimers());

  it('постановщик: подписи полные, вид кнопок как задуман', () => {
    renderPage();
    const buttons = within(row('Ворота'));
    expect(buttons.getByRole('button', { name: 'Принять' })).toHaveClass('kq', 'is-primary');
    expect(buttons.getByRole('button', { name: 'Вернуть на доработку' })).toHaveClass('kq', 'is-danger');
    expect(buttons.getByRole('button', { name: 'Вернуть на доработку' })).toHaveTextContent(/^Вернуть$/);
  });

  it('исполнитель видит свою задачу без кнопок', () => {
    renderPage({ me: worker, tasks: [first] });
    expect(row('Ворота').querySelector('.kacts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Принять' })).not.toBeInTheDocument();
  });

  it('«Принять»: строка уходит сразу, через 10 секунд запрос в базу', async () => {
    vi.useFakeTimers();
    renderPage();
    fireEvent.click(within(row('Ворота')).getByRole('button', { name: 'Принять' }));
    await flush();

    expect(screen.queryByRole('button', { name: 'Ворота' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «Принята»');
    expect(fake.rpc).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fake.rpc).toHaveBeenCalledWith('change_task_status', { p_task_id: 't1', p_to: 'accepted', p_comment: null });
  });

  it('«Отменить» возвращает строку, в базу ничего не уходит', async () => {
    vi.useFakeTimers();
    fake.respond('task_board', { data: [first] });
    renderPage();
    fireEvent.click(within(row('Ворота')).getByRole('button', { name: 'Принять' }));
    await flush();
    expect(screen.queryByRole('button', { name: 'Ворота' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Ворота' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('«Вернуть»: сначала окно с комментарием, затем строка уходит', async () => {
    vi.useFakeTimers();
    renderPage();
    fireEvent.click(within(row('Ворота')).getByRole('button', { name: 'Вернуть на доработку' }));

    expect(screen.getByRole('dialog', { name: 'Вернуть на доработку' })).toHaveTextContent('Ворота');
    expect(screen.getByRole('button', { name: 'Ворота' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Что нужно исправить'), { target: { value: 'Перекошены' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Вернуть' }));
    await flush();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ворота' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «На доработке»');
  });

  it('последняя строка ушла, база отказала: окно возврата снова с тем же текстом', async () => {
    vi.useFakeTimers();
    fake.respond('change_task_status', { error: { message: 'TypeError: Failed to fetch' }, status: 0 });
    fake.respond('task_board', { data: [first] });
    renderPage({ tasks: [first] });
    fireEvent.click(within(row('Ворота')).getByRole('button', { name: 'Вернуть на доработку' }));
    fireEvent.change(screen.getByLabelText('Что нужно исправить'), { target: { value: 'Перекошены' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Вернуть' }));
    await flush();
    expect(screen.getByRole('heading', { name: 'Сейчас ничего не ждёт проверки' })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    await flush();

    expect(screen.getByLabelText('Что нужно исправить')).toHaveValue('Перекошены');
    expect(screen.getByRole('button', { name: 'Ворота' })).toBeInTheDocument();
  });
});

describe('состояния', () => {
  it('пусто', () => {
    renderPage({ tasks: [hidden] });
    expect(screen.getByRole('heading', { name: 'Сейчас ничего не ждёт проверки' })).toBeInTheDocument();
    expect(screen.getByText('Когда исполнитель сдаст работу, задача появится здесь.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Все объекты' })).toBeInTheDocument();
  });

  it('загрузка: заголовок и кнопка на месте, «ничего нет» не мелькает', async () => {
    fake.respond('task_board', { data: [first] });
    fake.respond('objects', { data: [makeObject()] });
    fake.respond('profiles', { data: [worker] });
    renderScreen(<ReviewPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
    expect(screen.getByRole('heading', { level: 1, name: 'Ждут проверки' })).toBeInTheDocument();
    expect(screen.queryByText('Сейчас ничего не ждёт проверки')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Ворота' })).toBeInTheDocument();
    expect(row('Ворота')).toHaveTextContent('Пётр');
  });

  it.each(['task_board', 'objects', 'profiles'])('ошибка %s: текст и повтор, имён-заглушек нет', async (table) => {
    const good = { task_board: [first], objects: [makeObject()], profiles: [worker] };
    for (const [name, data] of Object.entries(good)) fake.respond(name, { data });
    fake.respond(table, { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    renderScreen(<ReviewPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Что-то пошло не так');
    expect(screen.queryByRole('button', { name: 'Ворота' })).not.toBeInTheDocument();

    fake.respond(table, { data: good[table as keyof typeof good] });
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('button', { name: 'Ворота' })).toBeInTheDocument();
    expect(row('Ворота')).toHaveTextContent('Пётр');
  });
});
