import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY, см. .env.example');
}

const TIMEOUT_MS = 15_000;

/** У каждого запроса есть предел ожидания: зависший сервер даёт ошибку с повтором, а не вечную загрузку. */
export const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
};

export const supabase = createClient<Database>(url, key, {
  global: { fetch: fetchWithTimeout },
  auth: { detectSessionInUrl: false },
});
