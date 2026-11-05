import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/shared/api/client';
import type { BoardTask, Profile } from '@/shared/api';
import { makeObject, makeTask, manager, otherWorker, renderScreen, worker } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { ObjectBoard } from './ObjectBoard';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
vi.mock('@/shared/ui/RichText', async () => (await import('@/shared/test/fakeRichText')).fakeRichTextModule());
const fake = supabase as unknown as FakeSupabase;

const objects = [makeObject(), makeObject({ id: 'o2', name: 'Склад на Южной', address: 'ул. Южная, 3' })];
const profiles = [manager, worker, otherWorker];
const refused = { data: null, error: { code: '42501', message: 'Это действие доступно постановщику' }, status: 403 };

function Where() {
  const { pathname, state } = useLocation();
  return <output data-testid="where">{JSON.stringify({ pathname, state })}</output>;
}

function show(tasks: BoardTask[], me: Profile = manager) {
  return renderScreen(
    <>
      <ObjectBoard objectId="o1" />
      <Where />
    </>,
    { me, tasks, objects, profiles },
  );
}

const col = (key: string) => document.querySelector<HTMLElement>(`.k-${key}`) as HTMLElement;
const card = (id: string) => document.querySelector<HTMLElement>(`[data-card="${id}"]`) as HTMLElement;
const titles = (key: string) => [...col(key).querySelectorAll('.kopen')].map((el) => el.textContent);

beforeEach(() => fake.reset());

describe('ObjectBoard: состояния', () => {
  it('пока задачи грузятся, показывает загрузку', () => {
    renderScreen(<ObjectBoard objectId="o1" />, { objects, profiles });
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
    expect(document.querySelector('.board')).toBeNull();
  });

  it('ошибка задач: текст и повтор возвращают доску', async () => {
    fake.respond('task_board', { data: null, error: { message: 'boom' }, status: 500 });
    renderScreen(<ObjectBoard objectId="o1" />, { objects, profiles });
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fake.respond('task_board', { data: [makeTask()] });
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Залить фундамент')).toBeInTheDocument();
  });

  it.each([
    ['profiles', { objects }],
    ['objects', { profiles }],
  ])('без %s доски нет: ошибка с повтором', async (table, data) => {
    fake.respond(table, { data: null, error: { message: 'boom' }, status: 500 });
    renderScreen(<ObjectBoard objectId="o1" />, { tasks: [makeTask()], ...data });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(document.querySelector('.board')).toBeNull();
  });

  it.each([
    [manager, true],
    [worker, false],
  ])('пустой объект: кнопка создания только у постановщика (%o)', (me, canCreate) => {
    show([], me);
    expect(screen.getByRole('heading', { name: 'На этом объекте пока нет задач' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Создать задачу' })).toHaveLength(canCreate ? 1 : 0);
    expect(document.querySelector('.board')).toBeNull();
  });

  it('задачи только этого объекта', () => {
    show([makeTask(), makeTask({ id: 't2', object_id: 'o2', title: 'Чужой объект' })]);
    expect(screen.queryByText('Чужой объект')).not.toBeInTheDocument();
  });
});

describe('ObjectBoard: колонки', () => {
  it.each([
    [manager, ['Новая', 'В работе', 'На проверке', 'На доработке', 'Принята']],
    [worker, ['Новая', 'В работе', 'На проверке', 'Принята']],
  ])('колонки роли (%o)', (me, labels) => {
    show([makeTask()], me);
    expect([...document.querySelectorAll('.col-h > span:first-of-type')].map((el) => el.textContent)).toEqual(labels);
  });

  it('у исполнителя доработка лежит первой в «Новой» и действует как доработка', () => {
    show([makeTask({ id: 'a', title: 'Обычная' }), makeTask({ id: 'b', title: 'Вернули', status: 'rework', return_count: 1 })], worker);
    expect(titles('new')).toEqual(['Вернули', 'Обычная']);
    expect(within(card('b')).getByRole('button', { name: 'Снова взять в работу' })).toBeInTheDocument();
  });

  it('у постановщика доработка в своей колонке', () => {
    show([makeTask({ status: 'rework', return_count: 1 })]);
    expect(titles('new')).toEqual([]);
    expect(titles('rework')).toEqual(['Залить фундамент']);
  });

  it('счётчик колонки и «Пусто» у пустой', () => {
    show([makeTask({ id: 'a' }), makeTask({ id: 'b' })]);
    expect(col('new').querySelector('.col-n')).toHaveTextContent('2');
    expect(within(col('new')).queryByText('Пусто')).not.toBeInTheDocument();
    expect(col('work').querySelector('.col-n')).toHaveTextContent('0');
    expect(within(col('work')).getByText('Пусто')).toBeInTheDocument();
  });

  it.each([
    [manager, 1],
    [worker, 0],
  ])('кнопка создания только в «Новой» постановщика (%o)', (me, count) => {
    show([makeTask()], me);
    expect(document.querySelectorAll('.col-add')).toHaveLength(count);
    expect(col('new').querySelectorAll('.col-add')).toHaveLength(count);
  });

  it('телефон: колонки с действием и «Новая» постановщика первыми, пустые скрыты', () => {
    show([makeTask({ status: 'review' }), makeTask({ id: 'b', status: 'accepted' })]);
    expect(col('new')).toHaveClass('has-turn');
    expect(col('review')).toHaveClass('has-turn');
    expect(col('work')).toHaveClass('is-none');
    expect(col('accepted')).not.toHaveClass('has-turn');
    expect(col('accepted')).not.toHaveClass('is-none');
  });

  it('телефон: у исполнителя пустая «Новая» скрыта', () => {
    show([makeTask({ status: 'work' })], worker);
    expect(col('new')).toHaveClass('is-none');
    expect(col('work')).toHaveClass('has-turn');
  });
});

describe('ObjectBoard: карточка', () => {
  it('название открывает задачу с отметкой «с объекта»', async () => {
    show([makeTask()]);
    await userEvent.click(screen.getByRole('button', { name: 'Залить фундамент' }));
    expect(JSON.parse(screen.getByTestId('where').textContent)).toEqual({ pathname: '/tasks/t1', state: { from: 'object' } });
  });

  it.each([
    [worker.id, 'Пётр'],
    [null, 'Не назначен'],
  ])('метка исполнителя (%s)', (assignee_id, text) => {
    show([makeTask({ assignee_id })]);
    expect(card('t1').querySelector('.kmeta')).toHaveTextContent(text);
    expect(card('t1').querySelector('.kmeta use')).toHaveAttribute('href', '#i-work');
  });

  it.each<[string, Profile, BoardTask['status'], string | null, boolean]>([
    ['постановщик и проверка', manager, 'review', worker.id, true],
    ['постановщик и чужая работа', manager, 'work', worker.id, false],
    ['постановщик назначил себя', manager, 'work', manager.id, true],
    ['постановщик и принятая', manager, 'accepted', worker.id, false],
    ['исполнитель и своя новая', worker, 'new', worker.id, true],
    ['исполнитель и своя на проверке', worker, 'review', worker.id, false],
  ])('крюк и перетаскивание только у ждущей действия: %s', (_name, me, status, assignee_id, waits) => {
    show([makeTask({ status, assignee_id })], me);
    expect(!!card('t1').querySelector('.kc-hook')).toBe(waits);
    expect(card('t1').classList.contains('has-hook')).toBe(waits);
    expect(card('t1').classList.contains('is-draggable')).toBe(waits);
    expect(card('t1')).toHaveAttribute('draggable', String(waits));
    expect(!!card('t1').querySelector('.kq')).toBe(waits);
  });

  it.each<[BoardTask['status'], number, boolean]>([
    ['new', 1, true],
    ['work', 1, true],
    ['review', 1, true],
    ['rework', 1, true],
    ['accepted', 1, false],
    ['new', 0, false],
  ])('второй круг: %s, возвратов %i', (status, return_count, returned) => {
    show([makeTask({ status, return_count })]);
    expect(card('t1').classList.contains('is-returned')).toBe(returned);
    expect(!!within(card('t1')).queryByText('Доработка')).toBe(returned);
  });

  it('кнопка подсвечивает колонку-цель при наведении и фокусе', () => {
    show([makeTask({ status: 'review' })]);
    const accept = within(card('t1')).getByRole('button', { name: 'Принять' });
    const send = within(card('t1')).getByRole('button', { name: 'Вернуть на доработку' });

    fireEvent.mouseEnter(accept);
    expect(col('accepted')).toHaveClass('is-target');
    fireEvent.mouseLeave(accept);
    expect(col('accepted')).not.toHaveClass('is-target');

    fireEvent.focus(send);
    expect(col('rework')).toHaveClass('is-target');
    fireEvent.blur(send);
    expect(col('rework')).not.toHaveClass('is-target');
  });

  it('вид кнопок: опасная только у возврата', () => {
    show([makeTask({ status: 'review' })]);
    expect(within(card('t1')).getByRole('button', { name: 'Принять' })).toHaveClass('kq', 'is-primary');
    expect(within(card('t1')).getByRole('button', { name: 'Вернуть на доработку' })).toHaveClass('kq', 'is-danger');
  });

  it('нажатие кнопки снимает подсветку: mouseleave с уехавшей кнопки не придёт', async () => {
    show([makeTask({ status: 'review' })]);
    const accept = within(card('t1')).getByRole('button', { name: 'Принять' });
    fireEvent.mouseEnter(accept);
    fireEvent.click(accept);
    expect(col('accepted')).not.toHaveClass('is-target');
    expect(await screen.findByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  });

  it('после возврата колонка не остаётся подсвеченной: окно вернуло фокус на кнопку, которая уехала', async () => {
    show([makeTask({ status: 'review' })]);
    const send = within(card('t1')).getByRole('button', { name: 'Вернуть на доработку' });
    send.focus();
    await userEvent.click(send);
    await userEvent.type(screen.getByLabelText('Что нужно исправить'), 'Нет акта');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Вернуть' }));

    expect(await screen.findByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    await waitFor(() => expect(titles('rework')).toEqual(['Залить фундамент']));
    expect(col('rework')).not.toHaveClass('is-target');

    fake.respond('task_board', { data: [makeTask({ status: 'review' })] });
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await waitFor(() => expect(titles('review')).toEqual(['Залить фундамент']));
    expect(col('rework')).not.toHaveClass('is-target');
  });

  it('«Вернуть» сначала спрашивает причину, статус пока прежний', async () => {
    show([makeTask({ status: 'review' })]);
    await userEvent.click(within(card('t1')).getByRole('button', { name: 'Вернуть на доработку' }));
    expect(screen.getByRole('dialog', { name: 'Вернуть на доработку' })).toBeInTheDocument();
    expect(titles('review')).toEqual(['Залить фундамент']);
  });
});

describe('ObjectBoard: «Назначить»', () => {
  const assignButton = () => within(card('t1')).queryByRole('button', { name: 'Назначить исполнителя' });

  it.each<[Profile, string | null, boolean]>([
    [manager, null, true],
    [manager, worker.id, false],
    [worker, null, false],
  ])('кнопка только у постановщика и только у задачи без исполнителя (%o, %s)', (me, assignee_id, shown) => {
    show([makeTask({ assignee_id })], me);
    expect(!!assignButton()).toBe(shown);
  });

  it('выбор человека сохраняет исполнителя, постановщика тоже можно', async () => {
    show([makeTask({ assignee_id: null })]);
    await userEvent.click(assignButton() as HTMLElement);
    expect(screen.getByRole('option', { name: /Анна Смирнова/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Пётр Иванов/ }));

    await waitFor(() => expect(fake.calls('tasks').find((c) => c.method === 'update')?.args).toEqual([{ assignee_id: worker.id }]));
    expect(fake.calls('tasks').find((c) => c.method === 'eq')?.args).toEqual(['id', 't1']);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('после назначения кнопка исчезает, фокус переходит на название карточки', async () => {
    show([makeTask({ assignee_id: null })]);
    await userEvent.click(assignButton() as HTMLElement);
    fake.respond('task_board', { data: [makeTask({ assignee_id: worker.id })] });
    await userEvent.click(screen.getByRole('option', { name: /Пётр Иванов/ }));
    await waitFor(() => expect(within(card('t1')).getByRole('button', { name: 'Залить фундамент' })).toHaveFocus());
  });

  it('«Не назначен» у задачи без исполнителя ничего не отправляет', async () => {
    show([makeTask({ assignee_id: null })]);
    await userEvent.click(assignButton() as HTMLElement);
    await userEvent.click(screen.getByRole('option', { name: /Не назначен/ }));
    expect(fake.calls('tasks')).toEqual([]);
  });

  it('отказ базы показан текстом', async () => {
    fake.respond('tasks', refused);
    show([makeTask({ assignee_id: null })]);
    await userEvent.click(assignButton() as HTMLElement);
    await userEvent.click(screen.getByRole('option', { name: /Пётр Иванов/ }));
    expect(await screen.findByText('Это действие доступно постановщику')).toBeInTheDocument();
  });
});

describe('Окно создания задачи', () => {
  const open = async () => {
    await userEvent.click(document.querySelector('.col-add') as HTMLElement);
    return screen.getByRole('dialog', { name: 'Новая задача' });
  };
  const inserted = () => fake.calls('tasks').find((c) => c.method === 'insert')?.args[0];

  it('из пустого объекта окно тоже открывается', async () => {
    show([]);
    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));
    expect(screen.getByRole('dialog', { name: 'Новая задача' })).toBeInTheDocument();
  });

  it('без названия не отправляет: ошибка у поля и фокус на нём', async () => {
    show([makeTask()]);
    await open();
    const title = screen.getByLabelText('Название');
    await userEvent.type(title, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Напишите название задачи.');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('Напишите название задачи.');
    expect(title).toHaveFocus();
    expect(inserted()).toBeUndefined();
  });

  it('по умолчанию этот объект и без исполнителя, текст без лишних пробелов, после сохранения закрывается', async () => {
    show([makeTask()]);
    await open();
    expect(screen.getByRole('button', { name: 'Объект' })).toHaveTextContent('ЖК Северный');
    expect(screen.getByRole('button', { name: 'Исполнитель' })).toHaveTextContent('Не назначен');

    await userEvent.type(screen.getByLabelText('Название'), '  Новая стена ');
    await userEvent.type(screen.getByLabelText('Описание'), ' Кирпич ');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(inserted()).toEqual({ object_id: 'o1', title: 'Новая стена', description: 'Кирпич', assignee_id: null });
  });

  it.each([
    ['ровно предел уходит', 5000, true],
    ['на знак больше: не уходит, введённое на месте, фокус на поле', 5001, false],
  ])('описание: %s', async (_name, length, sent) => {
    show([makeTask()]);
    await open();
    await userEvent.type(screen.getByLabelText('Название'), 'Стена');
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'я'.repeat(length) } });
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    if (sent) {
      await waitFor(() => expect(inserted()).toMatchObject({ description: 'я'.repeat(length) }));
    } else {
      expect(inserted()).toBeUndefined();
      expect(screen.getByLabelText('Описание')).toHaveFocus();
      expect(screen.getByLabelText('Описание')).toHaveValue('я'.repeat(length));
    }
  });

  it('пока грузится картинка, сохранить нельзя: иначе она потеряется', async () => {
    show([makeTask()]);
    await open();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Начать загрузку' }));
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('подпись поля описания прежняя, подсказка в пустом поле', async () => {
    show([makeTask()]);
    await open();
    expect(screen.getByText('Описание')).toHaveClass('rt-label');
    expect(screen.getByLabelText('Описание')).toHaveAttribute('placeholder', 'Добавьте описание');
  });

  it('объект и исполнитель выбираются из списка', async () => {
    show([makeTask()]);
    await open();
    await userEvent.type(screen.getByLabelText('Название'), 'Стена');
    await userEvent.click(screen.getByRole('button', { name: 'Объект' }));
    await userEvent.click(screen.getByRole('option', { name: /Склад на Южной/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Исполнитель' }));
    await userEvent.click(screen.getByRole('option', { name: /Сергей Козлов/ }));

    expect(screen.getByRole('button', { name: 'Объект' })).toHaveTextContent('Склад на Южной');
    expect(screen.getByRole('button', { name: 'Исполнитель' })).toHaveTextContent('Сергей Козлов');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(inserted()).toMatchObject({ object_id: 'o2', assignee_id: otherWorker.id }));
  });

  it('ввод во время сохранения не даёт отправить окно второй раз', async () => {
    let answer: (value: Response) => void = () => {};
    show([makeTask()]);
    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));
    const name = screen.getByLabelText('Название');
    await userEvent.type(name, 'Новая');
    fake.from.mockImplementationOnce(() => ({ insert: () => ({ select: () => ({ single: () => new Promise((resolve) => { answer = resolve as typeof answer; }) }) }) }) as never);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await userEvent.type(name, ' правка');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    answer({ data: makeTask(), error: null, status: 201 } as never);
  });

  it('исправление названия убирает прошлый отказ базы', async () => {
    fake.respond('tasks', refused);
    show([makeTask()]);
    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));
    const name = screen.getByLabelText('Название');
    await userEvent.type(name, 'Новая');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('постановщику');
    await userEvent.type(name, ' правка');
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull();
  });

  it('отказ базы: текст в окне, ввод на месте', async () => {
    fake.respond('tasks', refused);
    show([makeTask()]);
    await open();
    await userEvent.type(screen.getByLabelText('Название'), 'Стена');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Это действие доступно постановщику');
    expect(screen.getByLabelText('Название')).toHaveValue('Стена');
  });

  it('пока идёт запрос, повторно не отправить и не закрыть', async () => {
    show([makeTask()]);
    await open();
    await userEvent.type(screen.getByLabelText('Название'), 'Стена');
    // Запрос, на который ответа нет: thenable никогда не вызывает колбэк.
    const silent: object = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? () => {} : () => silent) });
    fake.from.mockReturnValueOnce(silent as never);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled());
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.veil')).not.toHaveClass('is-closing');
  });

  it('«Отмена» закрывает без запроса', async () => {
    show([makeTask()]);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(inserted()).toBeUndefined();
  });
});
