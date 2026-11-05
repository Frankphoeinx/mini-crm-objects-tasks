import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { ApiError } from '../lib/errors';

/** Повторяем только сеть и 5xx: отказ базы и 4xx повтором не лечатся. */
export function shouldRetry(failureCount: number, error: unknown) {
  return failureCount < 2 && error instanceof ApiError && error.retryable;
}

export function createQueryClient() {
  // Сервер не принял токен, обновить его не вышло: сессии больше нет, защита адресов уведёт на вход.
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.kind === 'auth') void supabase.auth.signOut({ scope: 'local' });
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // Без сети запрос сразу даёт ошибку с повтором, а не вечную загрузку. Realtime нет: свежесть даёт возврат на вкладку.
        networkMode: 'always',
        staleTime: 10_000,
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: true,
        retry: shouldRetry,
      },
      mutations: { networkMode: 'always', retry: false },
    },
  });
}
