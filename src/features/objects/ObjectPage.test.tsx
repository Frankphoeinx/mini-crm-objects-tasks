import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys, useMoveTask, type BoardTask, type ObjectRow } from '@/shared/api';
import { supabase } from '@/shared/api/client';
import { createTestQueryClient, makeObject, makeTask, manager, renderScreen, worker } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { ObjectPage } from './ObjectPage';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function Mover({ task }: { task: BoardTask }) {
  const move = useMoveTask();
  return <button onClick={() => move(task, 'accepted')}>Принять в доске</button>;
}

const where = () => screen.getByTestId('where');
const object = makeObject();
const tasks = [
  makeTask({ id: 't1', title: 'Фундамент', status: 'new' }),
  makeTask({ id: 't2', title: 'Стены', status: 'review' }),
  makeTask({ id: 't3', title: 'Кровля', status: 'accepted' }),
  makeTask({ id: 't4', title: 'Окна', status: 'rework' }),
  makeTask({ id: 't5', title: 'Чужой объект', status: 'new', object_id: 'o2' }),
];

type Options = { me?: typeof manager; row?: ObjectRow | null; rows?: BoardTask[]; board?: ReactNode };

function renderPage({ me = manager, row = object, rows = tasks, board = <p>Доска</p> }: Options = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(keys.object(object.id), row);
  queryClient.setQueryData(keys.board, rows);
  return renderScreen(
    <>
      <ObjectPage objectId={object.id} board={board} />
      <Where />
    </>,
    { me, queryClient, route: `/objects/${object.id}` },
  );
}

const manage = () => ({
  edit: screen.queryByRole('button', { name: 'Изменить объект' }),
  del: screen.queryByRole('button', { name: 'Удалить объект' }),
});

beforeEach(() => fake.reset());

describe('шапка', () => {
  it('постановщик: название, адрес, метки, числа только этого объекта, значки правки, доска ниже', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'ЖК Северный' })).toBeInTheDocument();
    expect(screen.getByText('ул. Лесная, 14')).toBeInTheDocument();
    expect(screen.getByText('4 задачи')).toBeInTheDocument();
    expect(screen.getByText('На доработке')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ждут проверки/ })).toHaveTextContent('1');
    expect(screen.getByText('Готовность').parentElement).toHaveTextContent('Принято 1 из 4');
    expect(screen.getByText('25%')).toHaveClass('sr');
    expect(manage().edit).toBeInTheDocument();
    expect(manage().del).toBeInTheDocument();
    expect(document.querySelector('.hero')).toHaveClass('is-boss');
    expect(screen.queryByText('Ваш ход')).not.toBeInTheDocument();
    expect(screen.getByText('Доска')).toBeInTheDocument();
    expect(document.querySelector('.hero')?.nextElementSibling).toHaveTextContent('Доска');
  });

  it('исполнитель: нет значков правки, «Ваш ход» считает его действия на этом объекте', () => {
    renderPage({
      me: worker,
      rows: [makeTask({ id: 't1' }), makeTask({ id: 't2', status: 'work' }), makeTask({ id: 't3', status: 'review' }), makeTask({ id: 't5', object_id: 'o2' })],
    });
    expect(manage().edit).not.toBeInTheDocument();
    expect(manage().del).not.toBeInTheDocument();
    expect(document.querySelector('.hero')).not.toHaveClass('is-boss');
    const side = document.querySelector<HTMLElement>('.hero-side');
    expect(side).toHaveTextContent('Ваш ход');
    expect(within(side as HTMLElement).getByText('2')).toHaveClass('sr');
    expect(screen.getByText('3 задачи')).toBeInTheDocument();
  });

  it('метки «На доработке» нет, когда таких задач нет', () => {
    renderPage({ rows: [makeTask({ status: 'new' })] });
    expect(screen.getByText('1 задача')).toBeInTheDocument();
    expect(screen.queryByText('На доработке')).not.toBeInTheDocument();
  });

  it.each([
    ['Все объекты', '/objects'],
    [/Ждут проверки/, '/review'],
  ])('%s ведёт на %s', async (name, path) => {
    renderPage();
    await userEvent.click(screen.getByRole('link', { name }));
    expect(where()).toHaveTextContent(new RegExp(`^${path}$`));
  });

  it('принятие задачи: цифры меняются сразу, этаж вспыхивает', async () => {
    const task = tasks[1] as BoardTask;
    renderPage({ board: <Mover task={task} /> });
    expect(document.querySelector('.is-flash')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Принять в доске' }));
    expect(document.querySelector('.bld .is-flash')).toBeInTheDocument();
    expect(screen.getByText('Готовность').parentElement).toHaveTextContent('Принято 2 из 4');
  });
});

describe('состояния', () => {
  it('задачи не загрузились: нет ложных нулей и удаления, название и доска на месте', async () => {
    fake.respond('task_board', { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(keys.object(object.id), object);
    renderScreen(<ObjectPage objectId={object.id} board={<p>Доска</p>} />, { queryClient });

    await waitFor(() => expect(queryClient.getQueryState(keys.board)?.status).toBe('error'));
    expect(screen.getByRole('heading', { name: 'ЖК Северный' })).toBeInTheDocument();
    expect(screen.getByText('Доска')).toBeInTheDocument();
    expect(screen.queryByText(/задач/)).not.toBeInTheDocument();
    expect(screen.queryByText('Готовность')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ждут проверки/ })).not.toBeInTheDocument();
    expect(manage().del).toBeDisabled();
  });

  it('загрузка объекта: доски ещё нет', async () => {
    fake.respond('objects', { data: object });
    renderScreen(<ObjectPage objectId={object.id} board={<p>Доска</p>} />, { tasks });
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
    expect(screen.queryByText('Доска')).not.toBeInTheDocument();
    expect(await screen.findByText('Доска')).toBeInTheDocument();
  });

  it('из кэша списка объект виден сразу, без загрузки', async () => {
    fake.respond('objects', { data: object });
    renderScreen(<ObjectPage objectId={object.id} board={<p>Доска</p>} />, { tasks, objects: [object] });
    expect(screen.getByRole('heading', { name: 'ЖК Северный' })).toBeInTheDocument();
    await screen.findByText('Доска');
  });

  it.each([
    ['нет строки: не найден или скрыт правами', { data: null }],
    ['неверный id в адресе', { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' }, status: 400 }],
  ])('%s: «не найдено» без доски и без повтора, кнопка ведёт к объектам', async (_case, result) => {
    fake.respond('objects', result);
    renderScreen(
      <>
        <ObjectPage objectId="x" board={<p>Доска</p>} />
        <Where />
      </>,
      { tasks },
    );
    expect(await screen.findByRole('heading', { name: 'Здесь ничего нет' })).toBeInTheDocument();
    expect(screen.queryByText('Доска')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Все объекты' }));
    expect(where()).toHaveTextContent('/objects');
  });

  it('сбой загрузки объекта: текст и повтор, доски нет', async () => {
    fake.respond('objects', { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    renderScreen(<ObjectPage objectId={object.id} board={<p>Доска</p>} />, { tasks });
    expect(await screen.findByRole('alert')).toHaveTextContent('Что-то пошло не так');
    expect(screen.queryByText('Доска')).not.toBeInTheDocument();

    fake.respond('objects', { data: object });
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Доска')).toBeInTheDocument();
  });
});

describe('правка объекта', () => {
  it('поля заполнены, сохранение уходит с id, шапка показывает новое имя', async () => {
    const renamed = { ...object, name: 'ЖК Южный' };
    fake.respond('objects', { data: renamed });
    renderPage();
    await userEvent.click(manage().edit as HTMLElement);

    const dialog = screen.getByRole('dialog', { name: 'Изменить объект' });
    expect(within(dialog).getByLabelText('Название')).toHaveValue('ЖК Северный');
    expect(within(dialog).getByLabelText('Адрес')).toHaveValue('ул. Лесная, 14');

    await userEvent.clear(within(dialog).getByLabelText('Название'));
    await userEvent.type(within(dialog).getByLabelText('Название'), 'ЖК Южный');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const calls = fake.calls('objects');
    expect(calls.find((c) => c.method === 'update')?.args).toEqual([{ name: 'ЖК Южный', address: 'ул. Лесная, 14' }]);
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['id', object.id]);
    expect(screen.getByRole('heading', { level: 1, name: 'ЖК Южный' })).toBeInTheDocument();
  });

  it('отказ базы: окно открыто, правка на месте', async () => {
    fake.respond('objects', { data: null, error: { code: '42501', message: 'Это действие доступно постановщику' }, status: 403 });
    renderPage();
    await userEvent.click(manage().edit as HTMLElement);
    await userEvent.type(screen.getByLabelText('Название'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Это действие доступно постановщику');
    expect(screen.getByLabelText('Название')).toHaveValue('ЖК Северный!');
  });
});

describe('удаление объекта', () => {
  it('окно: число задач и их список только этого объекта; после удаления переход на /objects', async () => {
    renderPage();
    await userEvent.click(manage().del as HTMLElement);

    const dialog = screen.getByRole('dialog', { name: 'Удалить объект «ЖК Северный»?' });
    expect(dialog).toHaveTextContent('Вместе с объектом скроются 4 задачи. Исполнители перестанут их видеть. История останется в базе.');
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Фундамент', 'Стены', 'Кровля', 'Окна']);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(where()).toHaveTextContent(/^\/objects$/));
    expect(fake.rpc).toHaveBeenCalledWith('delete_object', { p_object_id: object.id });
  });

  it('пустой объект: другой текст, без списка', async () => {
    renderPage({ rows: [] });
    await userEvent.click(manage().del as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Задач на объекте нет. Он исчезнет из списка.');
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
  });

  it('кэш задач очистился: окно не меняет текст и список, пока идёт удаление', async () => {
    const { queryClient } = renderPage();
    await userEvent.click(manage().del as HTMLElement);
    act(() => queryClient.setQueryData(keys.board, []));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('скроются 4 задачи');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(4);
  });

  it('отказ базы: текст в окне, перехода нет, можно повторить', async () => {
    fake.respond('delete_object', { data: null, error: { code: '42501', message: 'Это действие доступно постановщику' }, status: 403 });
    renderPage();
    await userEvent.click(manage().del as HTMLElement);
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Это действие доступно постановщику');
    expect(where()).toHaveTextContent(`/objects/${object.id}`);
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeEnabled();
  });

  describe('«Отмена»', () => {
    afterEach(() => vi.useRealTimers());

    it('закрывает окно без запроса', () => {
      vi.useFakeTimers();
      renderPage();
      fireEvent.click(manage().del as HTMLElement);
      fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
      act(() => {
        vi.advanceTimersByTime(120);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fake.rpc).not.toHaveBeenCalled();
    });
  });
});
