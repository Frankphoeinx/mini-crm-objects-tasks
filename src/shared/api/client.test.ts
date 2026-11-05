import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('клиент Supabase', () => {
  it.each([
    ['VITE_SUPABASE_URL'],
    ['VITE_SUPABASE_PUBLISHABLE_KEY'],
  ])('без %s сайт падает при запуске с понятной причиной', async (name) => {
    vi.stubEnv(name, '');
    await expect(import('./client')).rejects.toThrow('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY');
  });

  it.each([
    ['обычный запрос', 'http://localhost:54321/rest/v1/tasks', 15_000],
    ['файл в хранилище: картинка до 5 МБ не успеет за 15 секунд', 'http://localhost:54321/storage/v1/object/task-images/a.png', 120_000],
  ])('предел ожидания: %s', async (_name, url, limit) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response()));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { fetchWithTimeout } = await import('./client');
    await fetchWithTimeout(url);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(limit);
  });

  it('у каждого запроса есть предел ожидания, отмена запроса его не теряет', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      seen.push(init?.signal);
      return new Response('{}');
    }));
    const { fetchWithTimeout } = await import('./client');

    await fetchWithTimeout('http://x');
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]?.aborted).toBe(false);

    const parent = new AbortController();
    await fetchWithTimeout('http://x', { signal: parent.signal });
    expect(seen[1]?.aborted).toBe(false);
    parent.abort();
    expect(seen[1]?.aborted).toBe(true);
  });
});
