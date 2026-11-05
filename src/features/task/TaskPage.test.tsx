import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys, MeProvider, type BoardTask, type ObjectRow, type Profile, type TaskEvent } from '@/shared/api';
import { supabase } from '@/shared/api/client';
import { formatDateTime, taskLinkState, type TaskFrom } from '@/shared/lib';
import { createTestQueryClient, makeObject, makeTask, manager, otherWorker, worker } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { UndoProvider } from '@/shared/ui';
import { routeMarks } from './StatusRoute';
import { eventText } from './TaskHistory';
import { TaskPage } from './TaskPage';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
vi.mock('@/shared/ui/RichText', async () => (await import('@/shared/test/fakeRichText')).fakeRichTextModule());
const fake = supabase as unknown as FakeSupabase;

const north = makeObject();
const south = makeObject({ id: 'o2', name: 'Склад на Южной', address: 'ул. Южная, 3' });

function makeEvent(fields: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: 1,
    task_id: 't1',
    kind: 'created',
    actor_id: manager.id,
    from_status: null,
    to_status: 'new',
    comment: null,
    field: null,
    old_value: null,
    new_value: null,
    created_at: '2026-11-03T09:10:00Z',
    ...fields,
  };
}

const refused = { data: null, error: { code: '42501', message: 'Это действие доступно постановщику' }, status: 403 };

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

type OpenOptions = {
  task?: BoardTask;
  me?: Profile;
  from?: TaskFrom;
  events?: TaskEvent[];
  objects?: ObjectRow[];
};

/** Экран задачи с данными в кэше. Ответы базы после действий по умолчанию те же, что в кэше. */
function open({ task = makeTask(), me = manager, from, events = [makeEvent()], objects = [north, south] }: OpenOptions = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(keys.task(task.id), task);
  queryClient.setQueryData(keys.board, [task]);
  queryClient.setQueryData(keys.events(task.id), events);
  queryClient.setQueryData(keys.objectList, objects);
  queryClient.setQueryData(keys.profiles, [manager, worker, otherWorker]);
  fake.respond('tasks', { data: task });
  fake.respond('task_board', { data: task });
  fake.respond('task_events', { data: events });
  fake.respond('objects', { data: objects });
  return { queryClient, ...mount(queryClient, task.id, me, from) };
}

function mount(queryClient: ReturnType<typeof createTestQueryClient>, taskId: string, me: Profile, from?: TaskFrom) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/tasks/${taskId}`, state: from ? taskLinkState(from) : null }]}>
        <MeProvider profile={me}>
          <UndoProvider>
            <TaskPage taskId={taskId} />
            <Where />
          </UndoProvider>
        </MeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { container: view.container };
}

const updates = () => fake.calls('tasks').filter((c) => c.method === 'update').map((c) => c.args[0]);
const titleField = () => screen.getByRole('textbox', { name: 'Название задачи' });
const descField = () => screen.getByRole('textbox', { name: 'Описание задачи' });
const actions = () => screen.getByRole('complementary', { name: 'Действия' });
const where = () => screen.getByTestId('where').textContent;

beforeEach(() => fake.reset());

describe('состояния экрана', () => {
  it('сначала загрузка, затем карточка', async () => {
    fake.respond('task_board', { data: makeTask() });
    mount(createTestQueryClient(), 't1', worker);
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
    fake.respond('profiles', { data: [manager, worker] });
    fake.respond('objects', { data: [north] });
    expect(await screen.findByRole('heading', { name: 'Залить фундамент' })).toBeInTheDocument();
  });

  it('ошибка загрузки с повтором', async () => {
    fake.respond('task_board', { data: null, error: { message: 'boom' }, status: 500 });
    mount(createTestQueryClient(), 't1', worker);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не получилось загрузить');

    fake.respond('task_board', { data: makeTask() });
    fake.respond('profiles', { data: [manager, worker] });
    fake.respond('objects', { data: [north] });
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('heading', { name: 'Залить фундамент' })).toBeInTheDocument();
  });

  it.each([
    ['не найдена или скрыта правами', { data: null }],
    ['id не того вида', { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' }, status: 400 }],
  ])('%s: «Здесь ничего нет» без повтора', async (_name, answer) => {
    fake.respond('task_board', answer);
    mount(createTestQueryClient(), 't1', worker);
    expect(await screen.findByRole('heading', { name: 'Здесь ничего нет' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'К объектам' }));
    expect(where()).toBe('/objects');
  });

  it('фоновое обновление вернуло null: задачу скрыли, карточка уходит', async () => {
    const { queryClient } = open({ me: worker });
    act(() => queryClient.setQueryData(keys.task('t1'), null));
    expect(await screen.findByRole('heading', { name: 'Здесь ничего нет' })).toBeInTheDocument();
  });

  it('история не загрузилась: задача видна, у истории свой повтор', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(keys.task('t1'), makeTask());
    queryClient.setQueryData(keys.objectList, [north]);
    queryClient.setQueryData(keys.profiles, [manager, worker]);
    fake.respond('task_events', { data: null, error: { message: 'boom' }, status: 500 });
    mount(queryClient, 't1', worker);

    expect(screen.getByRole('status')).toHaveTextContent('Загружаем историю');
    expect(await screen.findByRole('alert')).toHaveTextContent('Не получилось загрузить историю');
    expect(screen.getByRole('heading', { name: 'Залить фундамент' })).toBeInTheDocument();

    fake.respond('task_events', { data: [makeEvent()] });
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Создана')).toBeInTheDocument();
  });
});

describe('показ по роли', () => {
  it('постановщик: поля, выбор и корзина; h1 остаётся для скринридера', () => {
    open();
    expect(titleField()).toHaveValue('Залить фундамент');
    expect(descField()).toHaveValue('Бетон М300');
    expect(screen.getByRole('heading', { level: 1, name: 'Залить фундамент' })).toHaveClass('sr');
    expect(screen.getByRole('button', { name: 'Удалить задачу' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Исполнитель: Пётр Иванов' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Объект: ЖК Северный' })).toBeInTheDocument();
  });

  it('исполнитель: обычный текст, правки и удаления нет', () => {
    const { container } = open({ me: worker });
    expect(screen.getByRole('heading', { level: 1, name: 'Залить фундамент' })).not.toHaveClass('sr');
    expect(screen.getByText('Бетон М300')).toHaveClass('tk-desc');
    expect(screen.queryByRole('textbox', { name: /Название|Описание/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить задачу' })).not.toBeInTheDocument();
    expect(container.querySelector('.pick-trigger')).toBeNull();
    expect(container.querySelector('.is-pick')).toBeNull();
    expect(screen.getByText('Пётр Иванов')).toBeInTheDocument();
    expect(screen.getByText('ЖК Северный', { selector: 'dd span' })).toBeInTheDocument();
  });

  it.each([
    ['постановщик', manager],
    ['исполнитель', worker],
  ])('%s: автор и дата создания текстом', (_name, me) => {
    const { container } = open({ me });
    const rows = [...container.querySelectorAll('.person:not(.is-pick)')].map((row) => row.textContent);
    expect(rows).toContain('АвторАнна Смирнова');
    expect(rows).toContain(`Создана${formatDateTime('2026-11-03T09:10:00Z')}`);
  });
});

describe('правка названия и описания', () => {
  it('название и описание уходят своими правками', async () => {
    const user = userEvent.setup();
    open();
    await user.type(titleField(), ' срочно{Enter}');
    await user.clear(descField());
    await user.tab();
    await waitFor(() => expect(updates()).toEqual([{ title: 'Залить фундамент срочно' }, { description: '' }]));
    expect(fake.calls('tasks')).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', 't1'] }));
  });

  it('пустое название не уходит в базу и поле возвращается', async () => {
    const user = userEvent.setup();
    open();
    await user.clear(titleField());
    await user.tab();
    expect(updates()).toEqual([]);
    expect(titleField()).toHaveValue('Залить фундамент');
  });

  it('отказ базы показан, набранное не пропало и уходит при следующей попытке', async () => {
    const user = userEvent.setup();
    open();
    fake.respond('tasks', refused);
    await user.type(titleField(), ' срочно{Enter}');
    expect(await screen.findByText('Это действие доступно постановщику')).toBeInTheDocument();
    expect(titleField()).toHaveValue('Залить фундамент срочно');
  });

  it('после успеха поле показывает данные базы и снова следит за обновлениями', async () => {
    const user = userEvent.setup();
    const { queryClient } = open();
    fake.respond('task_board', { data: makeTask({ title: 'Залить фундамент срочно' }) });
    await user.type(titleField(), ' срочно{Enter}');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Залить фундамент срочно'));

    act(() => queryClient.setQueryData(keys.task('t1'), makeTask({ title: 'Чужая правка' })));
    await waitFor(() => expect(titleField()).toHaveValue('Чужая правка'));
  });

  it('фоновое обновление не затирает начатый ввод', async () => {
    const user = userEvent.setup();
    const { queryClient } = open();
    await user.type(descField(), ' и арматура');
    act(() => queryClient.setQueryData(keys.task('t1'), makeTask({ description: 'Чужая правка' })));
    expect(descField()).toHaveValue('Бетон М300 и арматура');
    expect(descField()).toHaveFocus();
  });

  it('описание с переносами строк исполнитель видит с переносами', () => {
    open({ me: worker, task: makeTask({ description: 'Первое\nВторое' }) });
    expect(screen.getByText(/Первое/)).toHaveStyle({ whiteSpace: 'pre-wrap' });
  });
});

describe('исполнитель и объект через список', () => {
  const trigger = (name: string) => screen.getByRole('button', { name });
  const option = (name: RegExp) => screen.findByRole('option', { name });

  it.each([
    ['new', true],
    ['work', false],
    ['review', false],
    ['rework', false],
    ['accepted', false],
  ] as const)('статус %s: пункт «Не назначен» есть — %s', async (status, clearable) => {
    const user = userEvent.setup();
    open({ task: makeTask({ status }) });
    await user.click(trigger('Исполнитель: Пётр Иванов'));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.queryAllByRole('option', { name: /Не назначен/ })).toHaveLength(clearable ? 1 : 0);
  });

  it('новый исполнитель уходит в базу и виден сразу, не дожидаясь ответа', async () => {
    const user = userEvent.setup();
    open();
    const hang: object = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? () => {} : () => hang) });
    vi.mocked(fake.from).mockImplementationOnce(() => hang as never);
    await user.click(trigger('Исполнитель: Пётр Иванов'));
    await user.click(await option(/Сергей Козлов/));
    expect(await screen.findByRole('button', { name: 'Исполнитель: Сергей Козлов' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('снять исполнителя: в базу уходит null', async () => {
    const user = userEvent.setup();
    open();
    fake.respond('task_board', { data: makeTask({ assignee_id: null }) });
    await user.click(trigger('Исполнитель: Пётр Иванов'));
    await user.click(await option(/Не назначен/));
    await waitFor(() => expect(updates()).toEqual([{ assignee_id: null }]));
    expect(await screen.findByRole('button', { name: 'Исполнитель: Не назначен' })).toBeInTheDocument();
  });

  it('тот же выбор в базу не уходит', async () => {
    const user = userEvent.setup();
    open();
    await user.click(trigger('Объект: ЖК Северный'));
    await user.click(await option(/ЖК Северный/));
    expect(updates()).toEqual([]);
  });

  it('отказ базы показан, выбор вернулся', async () => {
    const user = userEvent.setup();
    open();
    fake.respond('tasks', refused);
    await user.click(trigger('Исполнитель: Пётр Иванов'));
    await user.click(await option(/Сергей Козлов/));
    expect(await screen.findByText('Это действие доступно постановщику')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Исполнитель: Пётр Иванов' })).toBeInTheDocument();
  });

  it('после смены объекта «назад» ведёт на новый объект', async () => {
    const user = userEvent.setup();
    open();
    fake.respond('task_board', { data: makeTask({ object_id: south.id }) });
    await user.click(trigger('Объект: ЖК Северный'));
    await user.click(await option(/Склад на Южной/));
    await waitFor(() => expect(updates()).toEqual([{ object_id: south.id }]));

    await user.click(await screen.findByRole('link', { name: 'Склад на Южной' }));
    expect(where()).toBe(`/objects/${south.id}`);
  });

  it('смена объекта не сбивает возврат в «Мои задачи»', async () => {
    const user = userEvent.setup();
    open({ from: 'my' });
    fake.respond('task_board', { data: makeTask({ object_id: south.id }) });
    await user.click(trigger('Объект: ЖК Северный'));
    await user.click(await option(/Склад на Южной/));
    expect(await screen.findByRole('button', { name: 'Объект: Склад на Южной' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Мои задачи' }));
    expect(where()).toBe('/my');
  });
});

const BACK_CASES: [TaskFrom | undefined, string, string][] = [
  ['my', 'Мои задачи', '/my'],
  ['review', 'Ждут проверки', '/review'],
  ['object', 'ЖК Северный', '/objects/o1'],
  [undefined, 'ЖК Северный', '/objects/o1'],
];

describe('возврат назад и удаление', () => {
  it.each(BACK_CASES)('открыта из %s: кнопка «%s» ведёт на %s', async (from, label, path) => {
    const user = userEvent.setup();
    open({ from });
    await user.click(screen.getByRole('link', { name: label }));
    expect(where()).toBe(path);
  });

  it('список объектов отстал от задачи: кнопка всё равно подписана и ведёт на объект', async () => {
    const user = userEvent.setup();
    open({ objects: [] });
    await user.click(screen.getByRole('link', { name: 'Объект' }));
    expect(where()).toBe('/objects/o1');
  });

  it.each(BACK_CASES)('открыта из %s: после удаления туда же (%s)', async (from, _label, path) => {
    const user = userEvent.setup();
    const { queryClient } = open({ from });
    await user.click(screen.getByRole('button', { name: 'Удалить задачу' }));
    const dialog = await screen.findByRole('dialog', { name: 'Удалить задачу «Залить фундамент»?' });
    expect(dialog).toHaveTextContent('Задача исчезнет у постановщиков и исполнителя. История останется в базе.');

    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(where()).toBe(path));
    expect(fake.rpc).toHaveBeenCalledWith('delete_task', { p_task_id: 't1' });
    expect(queryClient.getQueryData(keys.board)).toEqual([]);
  });

  it('отказ базы виден в окне, после закрытия окно открывается чистым', async () => {
    const user = userEvent.setup();
    open();
    fake.respond('delete_task', refused);
    await user.click(screen.getByRole('button', { name: 'Удалить задачу' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Это действие доступно постановщику');
    expect(where()).toBe('/tasks/t1');

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await waitForElementToBeRemoved(dialog);
    await user.click(screen.getByRole('button', { name: 'Удалить задачу' }));
    expect(within(await screen.findByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('блок действий', () => {
  const COMMENT_ANY = 'Комментарий, если нужен';
  const COMMENT_REQUIRED = 'Комментарий. Обязателен при возврате на доработку';

  it.each([
    ['исполнитель, новая', worker, makeTask(), 'Ваш ход', 'is-go', 'Новая', COMMENT_ANY, ['Взять в работу']],
    ['исполнитель, в работе', worker, makeTask({ status: 'work' }), 'Ваш ход', 'is-go', 'В работе', COMMENT_ANY, ['Отправить на проверку']],
    ['исполнитель, на доработке', worker, makeTask({ status: 'rework' }), 'Ваш ход', 'is-go', 'На доработке', COMMENT_ANY, ['Снова взять в работу']],
    ['постановщик, на проверке', manager, makeTask({ status: 'review' }), 'Ваш ход', 'is-go', 'На проверке', COMMENT_REQUIRED, ['Принять', 'Вернуть на доработку']],
    ['постановщик назначил себя', manager, makeTask({ assignee_id: manager.id }), 'Ваш ход', 'is-go', 'Новая', COMMENT_ANY, ['Взять в работу']],
  ])('есть ход: %s', (_name, me, task, title, cls, status, label, buttons) => {
    open({ me, task });
    const box = within(actions());
    expect(actions()).toHaveClass(cls);
    expect(box.getByText(title)).toHaveClass('lbl');
    expect(box.getByText(status)).toHaveClass('act-st');
    expect(box.getByLabelText(label)).toBeInTheDocument();
    expect(box.getAllByRole('button').map((b) => b.textContent)).toEqual(buttons);
  });

  it.each([
    ['без исполнителя', manager, makeTask({ assignee_id: null }), 'Сейчас', null, 'Исполнитель пока не назначен.'],
    ['ход исполнителя', manager, makeTask({ status: 'work' }), 'Сейчас', null, 'Сейчас ход исполнителя: Пётр.'],
    ['на проверке у постановщика', worker, makeTask({ status: 'review' }), 'Сейчас', null, 'Задача на проверке у постановщика.'],
    ['принята, постановщик', manager, makeTask({ status: 'accepted' }), 'Готово', 'is-done', 'Задача принята, дальше действий нет.'],
    ['принята, исполнитель', worker, makeTask({ status: 'accepted' }), 'Готово', 'is-done', 'Задача принята, дальше действий нет.'],
  ])('нет хода: %s', (_name, me, task, title, cls, wait) => {
    open({ me, task });
    const box = within(actions());
    expect(box.getByText(title)).toHaveClass('lbl');
    expect(box.getByText(wait)).toHaveClass('wait');
    expect(box.queryByRole('textbox')).not.toBeInTheDocument();
    expect(box.queryByRole('button')).not.toBeInTheDocument();
    expect(actions()).not.toHaveClass('is-go');
    if (cls) expect(actions()).toHaveClass(cls);
    else expect(actions()).not.toHaveClass('is-done');
  });

  const returned = {
    return_count: 1,
    last_return_comment: 'Ворота перекошены',
    last_return_by: manager.id,
    last_return_at: '2026-11-04T10:12:00Z',
  };

  it.each(['new', 'work', 'review', 'rework'] as const)('второй круг, статус %s: метка и причина возврата', (status) => {
    const { container } = open({ me: worker, task: makeTask({ status, ...returned }) });
    expect(container.querySelector('.tk-bar .chip.st-rework')).toHaveTextContent('Доработка');
    const why = container.querySelector('.act-why');
    expect(why).toHaveTextContent('Причина возврата');
    expect(why).toHaveTextContent('Ворота перекошены');
    expect(why).toHaveTextContent(`Анна Смирнова · ${formatDateTime(returned.last_return_at)}`);
  });

  it.each([
    ['принята после возврата', makeTask({ status: 'accepted', ...returned })],
    ['не возвращали', makeTask({ status: 'work' })],
  ])('%s: ни метки, ни причины, и отдельной метки статуса нет', (_name, task) => {
    const { container } = open({ task });
    expect(container.querySelector('.chip')).toBeNull();
    expect(container.querySelector('.act-why')).toBeNull();
  });

  describe('смена статуса с окном отмены', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
    const commentField = () => within(actions()).getByRole('textbox');
    const button = (name: string) => within(actions()).getByRole('button', { name });
    // С поддельными таймерами экран обновится, только когда сработает очередь уведомлений запросов.
    const press = async (name: string, detail = 1) => {
      fireEvent.click(button(name), { detail });
      await advance(0);
    };
    const review = makeTask({ status: 'review' });

    it('возврат без комментария: ошибка у поля, фокус на нём, статус прежний', async () => {
      open({ task: review });
      fireEvent.change(commentField(), { target: { value: '   ' } });
      await press('Вернуть на доработку');

      expect(within(actions()).getByRole('alert')).toHaveTextContent('Напишите, что нужно исправить: без комментария вернуть нельзя.');
      expect(commentField()).toHaveFocus();
      expect(commentField()).toHaveAttribute('aria-invalid', 'true');
      expect(commentField()).toHaveAccessibleDescription('Напишите, что нужно исправить: без комментария вернуть нельзя.');
      expect(within(actions()).getByText('На проверке')).toBeInTheDocument();

      await advance(10_000);
      expect(fake.rpc).not.toHaveBeenCalled();

      fireEvent.change(commentField(), { target: { value: 'П' } });
      expect(within(actions()).queryByRole('alert')).not.toBeInTheDocument();
      expect(commentField()).not.toHaveAttribute('aria-invalid');
    });

    it('«Принять» без комментария можно', async () => {
      open({ task: review });
      await press('Принять');
      expect(within(actions()).getByText('Принята')).toBeInTheDocument();
      await advance(10_000);
      expect(fake.rpc).toHaveBeenCalledWith('change_task_status', { p_task_id: 't1', p_to: 'accepted', p_comment: null });
    });

    it('возврат с комментарием: показ сразу, в базу через 10 секунд, история и причина видны', async () => {
      const { container } = open({ task: review, events: [makeEvent()] });
      fireEvent.change(commentField(), { target: { value: '  Ворота перекошены  ' } });
      await press('Вернуть на доработку');

      expect(screen.getByRole('status')).toHaveTextContent('Задача теперь «На доработке»');
      expect(within(actions()).getByText('На доработке')).toHaveClass('act-st');
      expect(actions()).not.toHaveClass('is-go');
      expect(container.querySelector('.act-why')).toHaveTextContent('Ворота перекошены');
      expect(container.querySelector('.tk-bar .chip')).toHaveTextContent('Доработка');
      expect(screen.getByText('На проверке → На доработке')).toBeInTheDocument();
      expect(container.querySelector('.ev:last-child')).toHaveClass('is-new');
      expect(container.querySelector('.ev:first-child')).not.toHaveClass('is-new');

      await advance(9_999);
      expect(fake.rpc).not.toHaveBeenCalled();
      fake.respond('task_board', { data: makeTask({ status: 'rework', ...returned }) });
      await advance(1);
      expect(fake.rpc).toHaveBeenCalledWith('change_task_status', { p_task_id: 't1', p_to: 'rework', p_comment: 'Ворота перекошены' });
    });

    it('«Отменить» возвращает статус, в базу ничего не уходит', async () => {
      open({ task: review });
      await press('Принять');
      fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
      await advance(0);
      expect(within(actions()).getByText('На проверке')).toHaveClass('act-st');
      await advance(10_000);
      expect(fake.rpc).not.toHaveBeenCalled();
    });

    it('отказ базы: статус откатился, причина показана, комментарий вернулся в поле', async () => {
      open({ task: review });
      fake.respond('change_task_status', refused);
      fireEvent.change(commentField(), { target: { value: 'Ворота перекошены' } });
      await press('Вернуть на доработку');
      expect(within(actions()).queryByRole('textbox')).not.toBeInTheDocument();

      await advance(10_050);
      expect(screen.getByText('Это действие доступно постановщику')).toBeInTheDocument();
      expect(within(actions()).getByText('На проверке')).toHaveClass('act-st');
      expect(commentField()).toHaveValue('Ворота перекошены');
    });

    it('новый ввод комментария отказ не затирает', async () => {
      const task = makeTask({ status: 'new', assignee_id: manager.id });
      open({ task });
      fake.respond('change_task_status', refused);
      fireEvent.change(commentField(), { target: { value: 'Первый' } });
      await press('Взять в работу');
      fireEvent.change(commentField(), { target: { value: 'Второй' } });

      await advance(10_050);
      expect(within(actions()).getByText('Новая')).toHaveClass('act-st');
      expect(commentField()).toHaveValue('Второй');
    });

    it('«Отменить» возвращает написанный комментарий в поле', async () => {
      open({ task: review });
      fireEvent.change(commentField(), { target: { value: 'Нет акта' } });
      await press('Принять');
      fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
      await advance(0);
      expect(commentField()).toHaveValue('Нет акта');
    });

    it('второй щелчок двойного нажатия не меняет статус дальше', async () => {
      open({ me: worker });
      await press('Взять в работу');
      await press('Отправить на проверку', 2);
      expect(within(actions()).getByText('В работе')).toHaveClass('act-st');
    });
  });
});

describe('история', () => {
  it('запись не пересоздаётся, когда временная строка получает настоящий номер из базы', async () => {
    const { queryClient } = open({ events: [makeEvent({ id: -1, kind: 'status', from_status: 'new', to_status: 'work' })] });
    const before = screen.getByText('Новая → В работе').closest('li');
    act(() => queryClient.setQueryData(keys.events('t1'), [makeEvent({ id: 7, kind: 'status', from_status: 'new', to_status: 'work' }), makeEvent({ id: 8, kind: 'edit', field: 'title', to_status: null })]));
    await screen.findByText('Название изменено');
    expect(screen.getByText('Новая → В работе').closest('li')).toBe(before);
  });

  const edit = (field: TaskEvent['field'], old_value: string | null, new_value: string | null) => makeEvent({ kind: 'edit', to_status: null, field, old_value, new_value });

  it.each([
    ['создание', makeEvent(), 'Создана'],
    ['переход', makeEvent({ kind: 'status', from_status: 'new', to_status: 'work' }), 'Новая → В работе'],
    ['возврат', makeEvent({ kind: 'status', from_status: 'review', to_status: 'rework' }), 'На проверке → На доработке'],
    ['название', edit('title', 'Старое', 'Новое'), 'Название изменено'],
    ['описание', edit('description', 'Старое', 'Новое'), 'Описание изменено'],
    ['объект', edit('object', 'ЖК Северный', 'Склад на Южной'), 'Объект: ЖК Северный → Склад на Южной'],
    ['исполнитель', edit('assignee', 'Не назначен', 'Пётр Иванов'), 'Исполнитель: Не назначен → Пётр Иванов'],
    ['удаление', makeEvent({ kind: 'deleted', to_status: null }), 'Задача удалена'],
  ])('текст записи: %s', (_name, event, text) => {
    expect(eventText(event)).toBe(text);
  });

  it('все записи по порядку: кто, когда, комментарий', () => {
    const { container } = open({
      me: worker,
      events: [
        makeEvent({ id: 1 }),
        makeEvent({ id: 2, kind: 'status', actor_id: worker.id, from_status: 'new', to_status: 'work', comment: 'Начал', created_at: '2026-11-03T11:42:00Z' }),
      ],
    });
    const rows = [...container.querySelectorAll('.tl > .ev')];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(`СозданаАнна Смирнова · ${formatDateTime('2026-11-03T09:10:00Z')}`);
    expect(rows[1]).toHaveTextContent(`Новая → В работеПётр Иванов · ${formatDateTime('2026-11-03T11:42:00Z')}Начал`);
    expect(rows[1]?.querySelector('.ev-cmt')).toHaveTextContent('Начал');
    expect(screen.getByRole('heading', { level: 2, name: 'История' })).toBeInTheDocument();
  });

  it.each([
    ['название', edit('title', 'Старое', 'Новое'), 'Было: Старое Стало: Новое'],
    ['описание добавили', edit('description', '', 'Новое'), 'Стало: Новое'],
    ['описание очистили', edit('description', 'Старое', ''), 'Было: Старое'],
    ['описание без значков разметки', edit('description', '**Старое**', '## Новое\n- пункт'), 'Было: Старое Стало: Новое пункт'],
    ['картинка в описании словом', edit('description', 'Схема', 'Схема ![](u/p.png)'), 'Было: Схема Стало: Схема [картинка]'],
    ['название разметкой не считается', edit('title', '**Старое**', 'Новое'), 'Было: **Старое** Стало: Новое'],
  ])('что было и что стало: %s', (_name, event, text) => {
    const { container } = open({ events: [event] });
    expect(container.querySelector('.ev.is-edit .ev-cmt')).toHaveTextContent(text);
  });

  it.each([
    ['объект: всё уже в заголовке', edit('object', 'А', 'Б')],
    ['исполнитель: всё уже в заголовке', edit('assignee', 'А', 'Б')],
    ['название без значений', edit('title', null, null)],
  ])('без отдельного блока: %s', (_name, event) => {
    const { container } = open({ events: [event] });
    expect(container.querySelector('.ev.is-edit')).not.toBeNull();
    expect(container.querySelector('.ev-cmt')).toBeNull();
  });

  it('правка и смена статуса различаются классом', () => {
    const { container } = open({ events: [makeEvent({ id: 1 }), { ...edit('title', 'А', 'Б'), id: 2 }] });
    const rows = container.querySelectorAll('.ev');
    expect(rows[0]).not.toHaveClass('is-edit');
    expect(rows[1]).toHaveClass('is-edit');
    expect(rows[0]).not.toHaveClass('is-new');
    expect(rows[1]).not.toHaveClass('is-new');
  });
});

describe('маршрут статусов', () => {
  const created = makeEvent({ id: 1 });
  const moved = (id: number, from_status: TaskEvent['from_status'], to_status: TaskEvent['to_status']) =>
    makeEvent({ id, kind: 'status', from_status, to_status });
  const toWork = moved(2, 'new', 'work');
  const toReview = moved(3, 'work', 'review');
  const toRework = moved(4, 'review', 'rework');
  const backToWork = moved(5, 'rework', 'work');
  const review2 = moved(6, 'work', 'review');
  const accepted = moved(7, 'review', 'accepted');

  it.each([
    ['только создана', 'new', [created], 'now next next next next', ''],
    ['в работе', 'work', [created, toWork], 'done now next next next', 'new>work'],
    ['на доработке', 'rework', [created, toWork, toReview, toRework], 'done done done next now', 'new>work work>review review>rework'],
    ['снова в работе', 'work', [created, toWork, toReview, toRework, backToWork], 'done now done next done', 'new>work work>review review>rework rework>work'],
    ['принята со второго круга', 'accepted', [created, toWork, toReview, toRework, backToWork, review2, accepted], 'done done done now done', 'new>work work>review review>accepted review>rework rework>work'],
  ] as const)('%s', (_name, status, events, nodes, lines) => {
    const { node, line } = routeMarks(status, [...events]);
    expect((['new', 'work', 'review', 'accepted', 'rework'] as const).map(node).join(' ')).toBe(nodes);
    const allLines = [['new', 'work'], ['work', 'review'], ['review', 'accepted'], ['review', 'rework'], ['rework', 'work']] as const;
    expect(allLines.filter(([a, b]) => line(a, b) === 'on').map(([a, b]) => `${a}>${b}`).join(' ')).toBe(lines);
  });

  it('правки на маршрут не влияют', () => {
    const { node } = routeMarks('new', [created, makeEvent({ id: 2, kind: 'edit', to_status: null, field: 'title' })]);
    expect(node('work')).toBe('next');
  });

  it('разметка: подпись вместо заголовка, узлы и линии с классами', () => {
    const { container } = open({ task: makeTask({ status: 'rework' }), events: [created, toWork, toReview, toRework] });
    const route = screen.getByRole('region', { name: 'Маршрут статусов задачи: сейчас На доработке' });
    expect(within(route).queryByRole('heading')).not.toBeInTheDocument();
    expect(route).toHaveClass('tk-route');
    expect(container.querySelector('.r-node.n1')).toHaveClass('done');
    expect(container.querySelector('.r-node.n4')).toHaveClass('next');
    expect(container.querySelector('.r-node.n5')).toHaveClass('now');
    expect(container.querySelector('.r-node.n5')).toHaveTextContent('На доработке');
    expect(container.querySelector('.r-seg.s1')).toHaveClass('on');
    expect(container.querySelector('.r-seg.s2')).toHaveClass('on');
    expect(container.querySelector('.r-seg.s3')).not.toHaveClass('on');
    expect(container.querySelector('.r-loop.l-r')).toHaveClass('on');
    expect(container.querySelector('.r-loop.l-l')).not.toHaveClass('on');
  });
});
