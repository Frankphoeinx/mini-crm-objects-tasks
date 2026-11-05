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
