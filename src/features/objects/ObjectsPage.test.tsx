import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskStatus } from '@/shared/api';
import { supabase } from '@/shared/api/client';
import { makeObject, makeTask, manager, renderScreen, worker } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { ObjectsPage } from './ObjectsPage';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

const where = () => screen.getByTestId('where');
const blocks = () => [...document.querySelectorAll<HTMLElement>('.sum > *')];
const task = (id: string, status: TaskStatus, objectId = 'o1') => makeTask({ id, status, object_id: objectId });

const tasks = [task('t1', 'new'), task('t2', 'review'), task('t3', 'accepted'), task('t4', 'rework', 'o2')];
const objects = [makeObject(), makeObject({ id: 'o2', name: 'Склад', address: 'ул. Мира, 3' })];

function renderPage(options: Parameters<typeof renderScreen>[1] = {}) {
  return renderScreen(
    <>
      <ObjectsPage />
      <Where />
    </>,
    { tasks, objects, ...options },
  );
}

beforeEach(() => fake.reset());

describe('сводка', () => {
  it('постановщик: чёрный блок, готовность, «Добавить объект»; «Ваш ход» нет', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Объекты' })).toBeInTheDocument();
    const [crane, ready, add, ...rest] = blocks();
    expect(rest).toEqual([]);
    expect(crane).toHaveTextContent('Ждут проверки');
    expect(within(crane as HTMLElement).getByText('1')).toHaveClass('sr');
    expect(ready).toHaveTextContent('Готовность');
    expect(ready).toHaveTextContent('Принято 1 из 4');
    expect(within(ready as HTMLElement).getByText('25%')).toHaveClass('sr');
    expect(add).toHaveTextContent('Добавить объект');
    expect(screen.queryByText('Ваш ход')).not.toBeInTheDocument();
  });

  it('исполнитель: «Ваш ход» первым, считает только ждущие его действия, ведёт на /my', async () => {
    renderPage({ me: worker });
    const [turn, crane, ready, ...rest] = blocks();
    expect(rest).toEqual([]);
    expect(crane).toHaveTextContent('Ждут проверки');
    expect(ready).toHaveTextContent('Готовность');
    expect(turn).toHaveTextContent('Ваш ход');
    // Новая и доработка ждут исполнителя; на проверке и принятая нет.
    expect(within(turn as HTMLElement).getByText('2')).toHaveClass('sr');
    expect(screen.queryByRole('button', { name: 'Добавить объект' })).not.toBeInTheDocument();

    await userEvent.click(turn as HTMLElement);
    expect(where()).toHaveTextContent('/my');
  });

  it('чёрный блок ведёт на /review', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Ждут проверки/ }));
    expect(where()).toHaveTextContent('/review');
  });

  it('без задач готовность 0 %, а не деление на ноль', () => {
    renderPage({ tasks: [] });
    expect(within(blocks()[1] as HTMLElement).getByText('0%')).toHaveClass('sr');
  });
});

describe('плитки строек', () => {
  it('название, адрес, метки, процент, переход на объект', async () => {
    renderPage();
    const tile = screen.getByRole('button', { name: /ЖК Северный/ });
    expect(tile).toHaveTextContent('ул. Лесная, 14');
    expect(tile).toHaveTextContent('3 задачи');
    expect(tile).toHaveTextContent('1 ждёт проверки');
    expect(tile).not.toHaveTextContent('На доработке');
    expect(tile).toHaveTextContent('33%');
    expect(tile).toHaveTextContent('Принято 1 из 3');
    expect(tile.querySelectorAll('.fl')).toHaveLength(3);
    expect(tile.querySelectorAll('.fl.is-full')).toHaveLength(1);

    const second = screen.getByRole('button', { name: /Склад/ });
    expect(second).toHaveTextContent('1 задача');
    expect(second).toHaveTextContent('На доработке');
    expect(second).not.toHaveTextContent('ждёт проверки');

    await userEvent.click(second);
    expect(where()).toHaveTextContent('/objects/o2');
  });

  it.each([
    [1, '1 ждёт проверки', '1 задача'],
    [2, '2 ждут проверки', '2 задачи'],
    [5, '5 ждут проверки', '5 задач'],
    [11, '11 ждут проверки', '11 задач'],
    [21, '21 ждёт проверки', '21 задача'],
  ])('подписи чисел: %i', (n, waiting, count) => {
    renderPage({ tasks: Array.from({ length: n }, (_, i) => task(`t${i}`, 'review')), objects: [makeObject()] });
    const tile = screen.getByRole('button', { name: /ЖК Северный/ });
    expect(tile).toHaveTextContent(waiting);
    expect(tile).toHaveTextContent(count);
  });

  it('волна: плитки идут после сводки с шагом 25 мс', () => {
    renderPage();
    const [first, second] = [...document.querySelectorAll<HTMLElement>('.obj')];
    expect(first).toHaveClass('w');
    expect(first?.style.getPropertyValue('--d')).toBe('50ms');
    expect(second?.style.getPropertyValue('--d')).toBe('75ms');
  });
});

describe('состояния', () => {
  it.each([
    ['постановщик', manager, 'Добавьте первый объект, и здесь вырастет его здание.'],
    ['исполнитель', worker, 'Вас пока не назначили ни на один объект.'],
  ])('пусто: %s', (_role, me, text) => {
    renderPage({ me, objects: [], tasks: [] });
    expect(screen.getByRole('heading', { name: 'Объектов пока нет' })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('сначала загрузка, потом данные', async () => {
    fake.respond('objects', { data: objects });
    fake.respond('task_board', { data: tasks });
    renderPage({ objects: undefined, tasks: undefined });
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
    expect(await screen.findByRole('button', { name: /ЖК Северный/ })).toBeInTheDocument();
  });

  it.each(['objects', 'task_board'])('ошибка %s: текст и повтор', async (table) => {
    fake.respond('objects', { data: objects });
    fake.respond('task_board', { data: tasks });
    fake.respond(table, { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    renderPage({ objects: undefined, tasks: undefined });

    expect(await screen.findByRole('alert')).toHaveTextContent('Что-то пошло не так');
    expect(screen.queryByText('boom', { exact: false })).not.toBeInTheDocument();

    fake.respond(table, { data: table === 'objects' ? objects : tasks });
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('button', { name: /ЖК Северный/ })).toBeInTheDocument();
  });
});

describe('окно нового объекта (AC-14)', () => {
  const open = () => userEvent.click(screen.getByRole('button', { name: 'Добавить объект' }));
  const save = () => userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  const nameField = () => screen.getByLabelText('Название');
  const addressField = () => screen.getByLabelText('Адрес');

  it.each([
    ['пусто', '', '', 'Название'],
    ['пробелы вместо названия', '   ', 'ул. Мира', 'Название'],
    ['нет адреса', 'Склад', '  ', 'Адрес'],
  ])('не отправляет: %s', async (_case, name, address, invalid) => {
    renderPage();
    await open();
    expect(screen.getByRole('dialog', { name: 'Новый объект' })).toBeInTheDocument();
    if (name) await userEvent.type(nameField(), name);
    if (address) await userEvent.type(addressField(), address);
    await save();

    expect(screen.getByRole('alert')).toHaveTextContent('Заполните название и адрес.');
    expect(fake.calls('objects').filter((c) => c.method === 'insert')).toEqual([]);
    const field = screen.getByLabelText(invalid);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'bs-oerr');
    expect(field).toHaveFocus();
  });

  it('ошибка уходит при вводе', async () => {
    renderPage();
    await open();
    await save();
    await userEvent.type(nameField(), 'С');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Enter сохраняет с обрезанными пробелами, окно закрывается, остаёмся в списке', async () => {
    fake.respond('objects', { data: objects });
    renderPage();
    await open();
    await userEvent.type(nameField(), '  Склад ');
    await userEvent.type(addressField(), ' ул. Мира, 3 {Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fake.calls('objects').find((c) => c.method === 'insert')?.args).toEqual([{ name: 'Склад', address: 'ул. Мира, 3' }]);
    expect(where()).toHaveTextContent(/^\/$/);
  });

  it.each([
    ['отказ базы', { code: '23514', message: 'Название: не больше 200 знаков.' }, 400, 'Название: не больше 200 знаков.'],
    ['нет сети', { message: 'TypeError: Failed to fetch' }, 0, 'Нет связи с сервером'],
  ])('%s: окно открыто, ввод на месте (AC-18)', async (_case, error, status, text) => {
    fake.respond('objects', { data: null, error, status });
    renderPage();
    await open();
    await userEvent.type(nameField(), 'Склад');
    await userEvent.type(addressField(), 'ул. Мира');
    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(nameField()).toHaveValue('Склад');
    expect(addressField()).toHaveValue('ул. Мира');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });

  it('пока идёт запрос: кнопки выключены, Esc не закрывает', async () => {
    let finish: (result: unknown) => void = () => {};
    const answer = new Promise((resolve) => {
      finish = resolve;
    });
    renderPage();
    await open();
    await userEvent.type(nameField(), 'Склад');
    await userEvent.type(addressField(), 'ул. Мира');
    fake.from.mockImplementationOnce((() => ({ insert: () => ({ select: () => ({ single: () => answer }) }) })) as never);
    await save();

    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fake.respond('objects', { data: objects });
    finish({ data: objects[0], error: null, status: 201 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  describe('«Отмена»', () => {
    afterEach(() => vi.useRealTimers());

    it('закрывает окно без запроса', () => {
      vi.useFakeTimers();
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Добавить объект' }));
      fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
      act(() => {
        vi.advanceTimersByTime(120);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fake.calls('objects')).toEqual([]);
    });
  });
});
