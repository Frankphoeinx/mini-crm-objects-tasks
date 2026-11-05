import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/shared/api';
import { supabase } from '@/shared/api/client';
import { makeTask, manager, worker } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { App } from './App';
import { routes } from './routes';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());

// Каркас проверяем отдельно от экранов: адрес должен дойти до публичного входа фичи с нужными пропсами.
vi.mock('@/features/objects', () => ({
  ObjectsPage: () => <h1>Экран объектов</h1>,
  ObjectPage: ({ objectId, board }: { objectId: string; board: ReactNode }) => (
    <>
      <h1>Экран объекта {objectId}</h1>
      {board}
    </>
  ),
}));
vi.mock('@/features/task', () => ({ TaskPage: ({ taskId }: { taskId: string }) => <h1>Экран задачи {taskId}</h1> }));
vi.mock('@/features/board', async () => {
  const { useMoveTask } = await import('@/shared/api');
  const { makeTask, worker: assignee } = await import('@/shared/test');
  return {
    ObjectBoard: ({ objectId }: { objectId: string }) => <p>Доска объекта {objectId}</p>,
    MyTasksPage: function MyTasksPage() {
      const move = useMoveTask();
      return (
        <>
          <h1>Экран моих задач</h1>
          <button onClick={() => move(makeTask({ assignee_id: assignee.id }), 'work')}>Двинуть</button>
        </>
      );
    },
  };
});
vi.mock('@/features/review', () => ({ ReviewPage: () => <h1>Экран проверки</h1> }));

const fake = supabase as unknown as FakeSupabase;

function setup(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
  render(<App queryClient={queryClient} router={router} />);
  return { router, queryClient };
}

const pathOf = (router: ReturnType<typeof setup>['router']) => router.state.location.pathname;

function signedIn(profile: typeof manager) {
  fake.respond('profiles', { data: profile });
  act(() => fake.emitAuth(profile.id));
}

beforeEach(() => {
  fake.reset();
  fake.respond('task_board', { data: [] });
});

describe('защита адресов (контракт: без входа всё ведёт на /login)', () => {
  it.each(['/', '/objects', '/objects/1', '/tasks/1', '/my', '/review', '/неизвестно'])('гость на %s попадает на вход', async (path) => {
    const { router } = setup(path);
    act(() => fake.emitAuth(null));
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(pathOf(router)).toBe('/login');
    expect(screen.queryByRole('navigation', { name: 'Разделы' })).not.toBeInTheDocument();
  });

  it('пока сессия неизвестна, экран защищён загрузкой', () => {
    setup('/objects');
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем…');
    expect(screen.queryByRole('navigation', { name: 'Разделы' })).not.toBeInTheDocument();
  });

  it('пока профиль загружается, каркаса нет', async () => {
    fake.respond('profiles', { data: worker });
    const { router } = setup('/objects');
    act(() => fake.emitAuth(worker.id));
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем…');
    await screen.findByRole('navigation', { name: 'Разделы' });
    expect(pathOf(router)).toBe('/objects');
  });

  it('сессия закончилась: уходим на вход', async () => {
    const { router } = setup('/objects');
    signedIn(manager);
    await screen.findByRole('navigation', { name: 'Разделы' });
    act(() => fake.emitAuth(null));
    await screen.findByRole('heading', { name: 'Вход' });
    expect(pathOf(router)).toBe('/login');
  });
});

describe('куда после входа (контракт)', () => {
  it.each([
    ['постановщик', manager, '/objects'],
    ['исполнитель', worker, '/my'],
  ])('%s с корня', async (_name, profile, target) => {
    const { router } = setup('/');
    signedIn(profile);
    await waitFor(() => expect(pathOf(router)).toBe(target));
  });

  it.each([
    ['постановщик', manager, '/objects'],
    ['исполнитель', worker, '/my'],
  ])('%s уже вошёл и открыл /login', async (_name, profile, target) => {
    const { router } = setup('/login');
    signedIn(profile);
    await waitFor(() => expect(pathOf(router)).toBe(target));
  });

  it('вход с формы ведёт на экран роли', async () => {
    const user = userEvent.setup();
    const { router } = setup('/login');
    act(() => fake.emitAuth(null));
    await user.type(await screen.findByLabelText('Почта'), 'petr@stroyka.test');
    await user.type(screen.getByLabelText('Пароль'), 'x{Enter}');
    signedIn(worker);
    await waitFor(() => expect(pathOf(router)).toBe('/my'));
  });
});

describe('состояния каркаса', () => {
  it('ошибка загрузки профиля с повтором', async () => {
    fake.respond('profiles', { error: { message: 'TypeError: Failed to fetch' }, status: 0 });
    const user = userEvent.setup();
    setup('/objects');
    act(() => fake.emitAuth(worker.id));
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');

    fake.respond('profiles', { data: worker });
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('navigation', { name: 'Разделы' })).toBeInTheDocument();
  });

  it('сбой фонового обновления профиля не снимает сайт: открытые окна и ввод целы', async () => {
    const { queryClient } = setup('/objects');
    signedIn(worker);
    expect(await screen.findByRole('navigation', { name: 'Разделы' })).toBeInTheDocument();

    fake.respond('profiles', { error: { message: 'TypeError: Failed to fetch' }, status: 0 });
    await act(() => queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('profile') }));
    expect(screen.getByRole('navigation', { name: 'Разделы' })).toBeInTheDocument();
  });

  it('у экрана свой заголовок вкладки', async () => {
    const { router } = setup('/login');
    expect(document.title).toBe('Вход · Объекты и задачи');
    signedIn(worker);
    await screen.findByRole('navigation', { name: 'Разделы' });
    expect(pathOf(router)).toBe('/my');
  });

  it('при первом открытии фокус не перепрыгивает шапку, после смены экрана он в начале экрана', async () => {
    const { router } = setup('/objects');
    signedIn(worker);
    await screen.findByRole('navigation', { name: 'Разделы' });
    expect(document.querySelector('main')).not.toHaveFocus();
    await act(() => router.navigate('/my'));
    expect(document.querySelector('main')).toHaveFocus();
  });

  it('пользователь без профиля дальше не проходит и может выйти', async () => {
    fake.respond('profiles', { data: null });
    const user = userEvent.setup();
    setup('/objects');
    act(() => fake.emitAuth('u-unknown'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Профиль не найден');
    expect(screen.queryByRole('navigation', { name: 'Разделы' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('неизвестный адрес: не найдено, путь назад', async () => {
    const user = userEvent.setup();
    const { router } = setup('/нет-такого');
    signedIn(worker);
    expect(await screen.findByRole('heading', { name: 'Здесь ничего нет' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Разделы' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'К объектам' }));
    expect(pathOf(router)).toBe('/objects');
  });

  it('падение экрана не даёт белую страницу', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => {
      throw new Error('баг');
    };
    const router = createMemoryRouter([{ path: '/', element: <Broken />, errorElement: routes[0]?.errorElement }]);
    render(<App queryClient={createQueryClient()} router={router} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Экран не открылся');
  });
});

describe('верхняя панель', () => {
  it('кто вошёл, вкладки, выход; пустой счётчик не показан', async () => {
    setup('/objects');
    signedIn(manager);
    expect(await screen.findByText('Анна Смирнова')).toBeInTheDocument();
    expect(screen.getByText('Постановщик')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Объекты' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Мои задачи' })).not.toHaveAttribute('aria-current');
    expect(document.querySelector('.tab-n')).not.toBeInTheDocument();
  });

  it('счётчик «Мои задачи»: мои задачи, которые ждут моего действия', async () => {
    fake.respond('task_board', {
      data: [
        makeTask({ id: 't1', assignee_id: worker.id, status: 'new' }),
        makeTask({ id: 't2', assignee_id: worker.id, status: 'rework' }),
        makeTask({ id: 't3', assignee_id: worker.id, status: 'review' }),
        makeTask({ id: 't4', assignee_id: worker.id, status: 'accepted' }),
      ],
    });
    setup('/objects');
    signedIn(worker);
    const counter = await screen.findByLabelText('ждут вашего действия: 2');
    expect(counter).toHaveTextContent('2');
  });

  it('вкладки переключают адрес и ползунок', async () => {
    const user = userEvent.setup();
    const { router } = setup('/objects');
    signedIn(worker);
    await user.click(await screen.findByRole('link', { name: 'Мои задачи' }));
    expect(pathOf(router)).toBe('/my');
    expect(screen.getByRole('link', { name: 'Мои задачи' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('.tabs-thumb')).toHaveStyle({ transform: 'translateX(100%)' });

    await user.click(screen.getByRole('link', { name: 'Объекты' }));
    expect(pathOf(router)).toBe('/objects');
  });

  it.each([
    ['/my', 'page is-wide'],
    ['/review', 'page is-wide'],
    ['/objects/1', 'page is-wide'],
    ['/objects', 'page'],
    ['/tasks/1', 'page'],
  ])('раскладка %s', async (path, cls) => {
    setup(path);
    signedIn(worker);
    await screen.findByRole('navigation', { name: 'Разделы' });
    expect(document.querySelector('.page')?.className).toBe(cls);
  });

  it('выход: сессия закрыта, кэш очищен, экран входа', async () => {
    const user = userEvent.setup();
    const { router, queryClient } = setup('/objects');
    signedIn(worker);
    fake.auth.signOut.mockImplementationOnce(async () => {
      fake.emitAuth(null);
      return { error: null };
    });
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    await screen.findByRole('heading', { name: 'Вход' });
    expect(pathOf(router)).toBe('/login');
    expect(queryClient.getQueryCache().getAll().filter((q) => q.state.data !== undefined)).toEqual([]);
  });

  it('выход не удался: понятный текст, можно повторить', async () => {
    const user = userEvent.setup();
    setup('/objects');
    signedIn(worker);
    fake.auth.signOut.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Не получилось выйти');
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled();
  });
});

describe('окно отмены внутри сайта', () => {
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function startMove() {
    setup('/my');
    signedIn(worker);
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'Двинуть' }));
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  }

  it.each([
    ['выход', null],
    ['вход другого пользователя', 'u-other'],
  ])('%s в окне отмены: статус не меняется, в базу от чужого имени ничего не уходит', async (_name, nextUser) => {
    await startMove();
    act(() => fake.emitAuth(nextUser));
    await advance(20_000);
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
  });

  it('переход между экранами окно не закрывает', async () => {
    await startMove();
    fireEvent.click(screen.getByRole('link', { name: 'Объекты' }));
    await advance(0);
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    await advance(10_000);
    expect(fake.rpc).toHaveBeenCalledWith('change_task_status', { p_task_id: 't1', p_to: 'work', p_comment: null });
  });

  it('класс вспышки ставится на корень и снимается', async () => {
    await startMove();
    expect(document.querySelector('.bs')).toHaveClass('flash-work');
    await advance(900);
    expect(document.querySelector('.bs')).not.toHaveClass('flash-work');
  });

  it('окно и подсказка рисуются внутри корня с переменными темы', async () => {
    await startMove();
    expect(document.querySelector('.bs .toast.undo')).toBeInTheDocument();
  });
});

describe('адреса контракта ведут на публичные входы фич', () => {
  it.each([
    ['/objects', 'Экран объектов'],
    ['/objects/o1', 'Экран объекта o1'],
    ['/tasks/t1', 'Экран задачи t1'],
    ['/my', 'Экран моих задач'],
    ['/review', 'Экран проверки'],
  ])('%s', async (path, heading) => {
    setup(path);
    signedIn(manager);
    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument();
  });

  it('доска подставляется в страницу объекта', async () => {
    setup('/objects/o7');
    signedIn(manager);
    expect(await screen.findByText('Доска объекта o7')).toBeInTheDocument();
  });

  it('смена объекта в адресе пересоздаёт экран', async () => {
    const { router } = setup('/objects/o1');
    signedIn(manager);
    await screen.findByRole('heading', { name: 'Экран объекта o1' });
    await act(() => router.navigate('/objects/o2'));
    expect(screen.getByRole('heading', { name: 'Экран объекта o2' })).toBeInTheDocument();
  });
});
