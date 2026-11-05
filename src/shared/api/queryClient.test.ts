import { describe, expect, it, vi } from 'vitest';
import type { FakeSupabase } from '../test/fakeSupabase';
import { supabase } from './client';
import { ApiError } from '../lib/errors';
import { createQueryClient, shouldRetry } from './queryClient';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

const net = new ApiError('network', 'нет сети');
const server = new ApiError('server', 'сбой', 'XX000', 500);
const refused = new ApiError('refused', 'нельзя', 'P0001', 400);
const notFound = new ApiError('not-found', 'нет', 'PGRST116', 406);
const auth = new ApiError('auth', 'сессия', 'PGRST301', 401);

describe('shouldRetry: повторы только на сеть и 5xx', () => {
  it.each([
    [0, net, true],
    [1, net, true],
    [2, net, false],
    [0, server, true],
    [0, refused, false],
    [0, notFound, false],
    [0, auth, false],
    [0, new TypeError('баг'), false],
  ])('попытка %i: %o', (count, error, expected) => {
    expect(shouldRetry(count, error)).toBe(expected);
  });
});

describe('createQueryClient', () => {
  it('мутации не повторяются, возврат на вкладку обновляет данные', () => {
    const { queries, mutations } = createQueryClient().getDefaultOptions();
    expect(mutations?.retry).toBe(false);
    expect(queries?.refetchOnWindowFocus).toBe('always');
    expect(queries?.networkMode).toBe('always');
  });

  it.each<[string, Error, number]>([
    ['сессии нет: выходим', auth, 1],
    ['отказ базы: сессию не трогаем', refused, 0],
  ])('%s', async (_name, error, signOutCalls) => {
    const client = createQueryClient();
    await client
      .fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(error), retry: false })
      .catch(() => undefined);
    expect(fake.auth.signOut).toHaveBeenCalledTimes(signOutCalls);
  });
});
