// Общая обвязка тестов экранов: данные кладутся в кэш запросов, сети нет.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MeProvider } from '../api/session';
import { keys } from '../api/queries';
import type { BoardTask, ObjectRow, Profile, TaskEvent } from '../api/types';
import { UndoProvider } from '../ui/UndoProvider';

export const manager: Profile = { id: 'u-anna', full_name: 'Анна Смирнова', role: 'manager' };
export const worker: Profile = { id: 'u-petr', full_name: 'Пётр Иванов', role: 'worker' };
export const otherWorker: Profile = { id: 'u-sergey', full_name: 'Сергей Козлов', role: 'worker' };

export function makeTask(fields: Partial<BoardTask> = {}): BoardTask {
  return {
    id: 't1',
    object_id: 'o1',
    title: 'Залить фундамент',
    description: 'Бетон М300',
    assignee_id: worker.id,
    status: 'new',
    author_id: manager.id,
    created_at: '2026-11-03T09:10:00Z',
    deleted_at: null,
    return_count: 0,
    last_return_comment: null,
    last_return_by: null,
    last_return_at: null,
    ...fields,
  };
}

export function makeObject(fields: Partial<ObjectRow> = {}): ObjectRow {
  return {
    id: 'o1',
    name: 'ЖК Северный',
    address: 'ул. Лесная, 14',
    created_by: manager.id,
    created_at: '2026-11-01T09:00:00Z',
    deleted_at: null,
    ...fields,
  };
}

/** Клиент с данными, которые не устаревают: запросов к сети не будет, пока тест сам не попросит. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}

/** Обвязка для render и renderHook. */
export function providers({ me = manager, route = '/', queryClient }: { me?: Profile; route?: string; queryClient: QueryClient }) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <MeProvider profile={me}>
            <UndoProvider>{children}</UndoProvider>
          </MeProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

type RenderOptions = {
  me?: Profile;
  route?: string;
  tasks?: BoardTask[];
  objects?: ObjectRow[];
  profiles?: Profile[];
  events?: Record<string, TaskEvent[]>;
  queryClient?: QueryClient;
};

/** Рендер экрана с провайдерами сайта. Поддельный клиент Supabase: fakeSupabase.ts. */
export function renderScreen(ui: ReactElement, options: RenderOptions = {}) {
  const { me = manager, route = '/', tasks, objects, profiles, events, queryClient = createTestQueryClient() } = options;
  if (tasks) queryClient.setQueryData(keys.board, tasks);
  if (objects) queryClient.setQueryData(keys.objectList, objects);
  if (profiles) queryClient.setQueryData(keys.profiles, profiles);
  for (const [taskId, list] of Object.entries(events ?? {})) queryClient.setQueryData(keys.events(taskId), list);
  const view = render(ui, { wrapper: providers({ me, route, queryClient }) });
  return { ...view, queryClient };
}
