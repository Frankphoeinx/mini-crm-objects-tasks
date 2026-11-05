import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, manager, worker } from '../test';
import type { FakeSupabase } from '../test/fakeSupabase';
import { supabase } from './client';
import { MeProvider, SessionProvider, signIn, signOut, useCurrentProfile, useMe, useSession } from './session';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

function Probe() {
  const session = useSession();
  const profile = useCurrentProfile();
  return (
    <p>
      {session.status}:{session.userId ?? 'нет'}:{profile.data?.role ?? 'роли нет'}
    </p>
  );
}

function setup() {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => fake.reset());

describe('SessionProvider', () => {
  it('до первого события сессии идёт загрузка', () => {
    setup();
    expect(screen.getByText('loading:нет:роли нет')).toBeInTheDocument();
  });

  it('нет сессии: гость, профиль не запрашивается', () => {
    setup();
    act(() => fake.emitAuth(null));
    expect(screen.getByText('guest:нет:роли нет')).toBeInTheDocument();
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('вошёл: профиль и роль читаются из profiles', async () => {
    fake.respond('profiles', { data: worker });
    setup();
    act(() => fake.emitAuth(worker.id));
    expect(await screen.findByText(`ready:${worker.id}:worker`)).toBeInTheDocument();
    expect(fake.calls('profiles')).toContainEqual({ target: 'profiles', method: 'eq', args: ['id', worker.id] });
  });

  it('смена пользователя очищает кэш: чужие данные не видны следующему', async () => {
    fake.respond('profiles', { data: worker });
    const queryClient = setup();
    act(() => fake.emitAuth(worker.id));
    await screen.findByText(`ready:${worker.id}:worker`);
    queryClient.setQueryData(['secret'], 'данные прошлого пользователя');

    act(() => fake.emitAuth(null));
    expect(queryClient.getQueryData(['secret'])).toBeUndefined();
    expect(screen.getByText('guest:нет:роли нет')).toBeInTheDocument();
  });

  it('обновление токена не сбрасывает кэш', async () => {
    fake.respond('profiles', { data: worker });
    const queryClient = setup();
    act(() => fake.emitAuth(worker.id));
    await screen.findByText(`ready:${worker.id}:worker`);
    queryClient.setQueryData(['data'], 'остаётся');

    act(() => fake.emitAuth(worker.id));
    expect(queryClient.getQueryData(['data'])).toBe('остаётся');
  });

  it('отписывается при размонтировании', () => {
    const unsubscribe = vi.fn();
    fake.auth.onAuthStateChange.mockReturnValueOnce({ data: { subscription: { unsubscribe } } });
    const { unmount } = render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SessionProvider>{null}</SessionProvider>
      </QueryClientProvider>,
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useMe', () => {
  it.each([
    [manager, { initials: 'АС', roleLabel: 'Постановщик', isManager: true }],
    [worker, { initials: 'ПИ', roleLabel: 'Исполнитель', isManager: false }],
  ])('%o', (profile, expected) => {
    const { result } = renderHook(() => useMe(), {
      wrapper: ({ children }) => <MeProvider profile={profile}>{children}</MeProvider>,
    });
    expect(result.current).toMatchObject(expected);
  });

  it('вне защищённых адресов падает, а не показывает чужое', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useMe())).toThrow('useMe');
  });
});

describe('signIn и signOut', () => {
  it('приводит почту к нижнему регистру и убирает пробелы', async () => {
    await signIn('  Anna@Stroyka.Test ', 'пароль');
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'anna@stroyka.test', password: 'пароль' });
  });

  it('успех: null, отказ: текст', async () => {
    await expect(signIn('a@b.c', 'x')).resolves.toBeNull();
    fake.auth.signInWithPassword.mockResolvedValueOnce({ error: { code: 'invalid_credentials' } });
    await expect(signIn('a@b.c', 'x')).resolves.toBe('Неверная почта или пароль.');
  });

  it('выход только на этом устройстве: другой человек с той же демо-учёткой остаётся на сайте', async () => {
    await signOut();
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('выход сообщает об ошибке', async () => {
    await expect(signOut()).resolves.toBe(true);
    fake.auth.signOut.mockResolvedValueOnce({ error: { message: 'сеть' } });
    await waitFor(async () => expect(await signOut()).toBe(false));
  });
});
