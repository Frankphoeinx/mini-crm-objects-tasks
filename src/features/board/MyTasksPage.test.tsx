import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/shared/api/client';
import type { BoardTask, Profile } from '@/shared/api';
import { makeObject, makeTask, manager, otherWorker, renderScreen, worker } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { MyTasksPage } from './MyTasksPage';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

const objects = [makeObject(), makeObject({ id: 'o2', name: 'Склад на Южной' })];

function Where() {
  const { pathname, state } = useLocation();
  return <output data-testid="where">{JSON.stringify({ pathname, state })}</output>;
}

function show(tasks: BoardTask[], me: Profile = worker) {
  return renderScreen(
    <>
      <MyTasksPage />
      <Where />
    </>,
    { me, tasks, objects, profiles: [manager, worker, otherWorker] },
  );
}

const where = () => JSON.parse(screen.getByTestId('where').textContent);

beforeEach(() => fake.reset());

describe('MyTasksPage: шапка', () => {
  const mine = [
    makeTask({ id: 'a', status: 'new' }),
    makeTask({ id: 'b', status: 'work' }),
    makeTask({ id: 'c', status: 'review' }),
    makeTask({ id: 'd', status: 'accepted' }),
  ];

  it('заголовок, имя и роль, всего', () => {
    show(mine);
    expect(screen.getByRole('heading', { level: 1, name: 'Мои задачи' })).toBeInTheDocument();
    expect(screen.getByText('Пётр Иванов, Исполнитель')).toBeInTheDocument();
    expect(screen.getByText('Всего: 4')).toBeInTheDocument();
  });

  it('«Ваш ход» считает только ждущие моего действия', () => {
    show(mine);
    expect(document.querySelector('.turn-n')).toHaveTextContent('2');
  });

  it('чёрный блок считает всё на проверке и ведёт на /review', async () => {
    show([...mine, makeTask({ id: 'e', status: 'review', assignee_id: otherWorker.id })], manager);
    const block = screen.getByRole('link', { name: /Ждут проверки/ });
    expect(block.querySelector('.big-n')).toHaveTextContent('2');
    await userEvent.click(block);
    expect(where().pathname).toBe('/review');
  });
});

describe('MyTasksPage: доска', () => {
  it('только свои задачи', () => {
    show([makeTask({ id: 'a', title: 'Моя', assignee_id: manager.id }), makeTask({ id: 'b', title: 'Чужая' })], manager);
    expect(screen.getByRole('link', { name: 'Моя' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Чужая' })).not.toBeInTheDocument();
    expect(screen.getByText('Всего: 1')).toBeInTheDocument();
  });

  it('под названием объект со значком булавки', () => {
    show([makeTask({ object_id: 'o2' })]);
    const meta = document.querySelector('[data-card="t1"] .kmeta');
    expect(meta).toHaveTextContent('Склад на Южной');
    expect(meta?.querySelector('use')).toHaveAttribute('href', '#i-pin');
  });

  it('название открывает задачу с отметкой «из моих»', async () => {
    show([makeTask()]);
    await userEvent.click(screen.getByRole('link', { name: 'Залить фундамент' }));
    expect(where()).toEqual({ pathname: '/tasks/t1', state: { from: 'my' } });
  });

  it('постановщик и здесь видит пять колонок, но без создания', () => {
    show([makeTask({ assignee_id: manager.id })], manager);
    expect(document.querySelectorAll('.col')).toHaveLength(5);
    expect(document.querySelector('.col-add')).toBeNull();
    expect(document.querySelector('.k-new')).toHaveClass('has-turn');
    expect(document.querySelector('.k-work')).toHaveClass('is-none');
  });

  it('кнопка действия на карточке', () => {
    show([makeTask({ status: 'work' })]);
    const card = document.querySelector<HTMLElement>('[data-card="t1"]') as HTMLElement;
    expect(within(card).getByRole('button', { name: 'Отправить на проверку' })).toBeInTheDocument();
  });
});

describe('MyTasksPage: состояния', () => {
  it('пусто: текст и кнопка к объектам, шапка остаётся, доски нет', async () => {
    show([makeTask({ assignee_id: otherWorker.id })]);
    expect(screen.getByRole('heading', { name: 'Вам пока не назначили задач' })).toBeInTheDocument();
    expect(screen.getByText('Всего: 0')).toBeInTheDocument();
    expect(document.querySelector('.board')).toBeNull();

    await userEvent.click(screen.getByRole('link', { name: 'К объектам' }));
    expect(where().pathname).toBe('/objects');
  });

  it('пока задачи грузятся, шапки с нулями нет', () => {
    renderScreen(<MyTasksPage />, { me: worker, objects });
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
    expect(screen.queryByRole('heading', { name: 'Мои задачи' })).not.toBeInTheDocument();
  });

  it.each([
    ['task_board', { objects }],
    ['objects', { tasks: [makeTask()] }],
  ])('ошибка %s: текст и повтор', async (table, data) => {
    fake.respond(table, { data: null, error: { message: 'boom' }, status: 500 });
    renderScreen(<MyTasksPage />, { me: worker, ...data });
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fake.respond(table, { data: table === 'objects' ? objects : [makeTask()] });
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('heading', { name: 'Мои задачи' })).toBeInTheDocument();
  });
});

describe('MyTasksPage: подготовка карточки задачи', () => {
  it('имена загружаются заранее: при первом открытии задачи заголовок не сменится загрузкой', () => {
    renderScreen(<MyTasksPage />, { me: worker, tasks: [makeTask({ assignee_id: worker.id })], objects });
    expect(fake.from).toHaveBeenCalledWith('profiles');
  });
});
