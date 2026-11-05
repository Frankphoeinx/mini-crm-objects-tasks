// Поддельный клиент Supabase: без сети, запоминает цепочки вызовов, отвечает заранее заданным.
// Подключение в тесте: vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
import { vi } from 'vitest';

export type DbResult = { data: unknown; error: { code?: string; message: string; status?: number } | null; status: number };
type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;

export function createFakeSupabase() {
  const responses = new Map<string, DbResult>();
  const log: { target: string; method: string; args: unknown[] }[] = [];

  const chain = (target: string) => {
    const proxy: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            const promise = Promise.resolve(responses.get(target) ?? { data: [], error: null, status: 200 });
            return promise.then.bind(promise);
          }
          return (...args: unknown[]) => {
            log.push({ target, method: String(prop), args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const authListeners = new Set<AuthCallback>();

  /** Запрос к хранилищу виден как calls('storage'), ответ задаёт respond('storage'). */
  const storageCall = (method: string, data: unknown) =>
    vi.fn(async (...args: unknown[]) => {
      log.push({ target: 'storage', method, args });
      return responses.get('storage') ?? { data, error: null, status: 200 };
    });

  return {
    from: vi.fn((table: string) => chain(table)),
    storage: {
      from: vi.fn(() => ({
        upload: storageCall('upload', { path: 'p' }),
        download: storageCall('download', new Blob(['x'], { type: 'image/png' })),
      })),
    },
    rpc: vi.fn((name: string, args: unknown) => {
      log.push({ target: name, method: 'rpc', args: [args] });
      return chain(name);
    }),
    auth: {
      signInWithPassword: vi.fn<(credentials: { email: string; password: string }) => Promise<{ error: unknown }>>(async () => ({ error: null })),
      signOut: vi.fn<(options?: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        authListeners.add(callback);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
      }),
    },

    /** Ответ таблицы или функции. */
    respond(target: string, result: Partial<DbResult>) {
      responses.set(target, { data: null, error: null, status: 200, ...result });
    },
    /** Событие сессии. userId = null: вышел. */
    emitAuth(userId: string | null) {
      const session = userId ? { user: { id: userId } } : null;
      authListeners.forEach((callback) => callback(userId ? 'SIGNED_IN' : 'SIGNED_OUT', session));
    },
    calls(target: string) {
      return log.filter((entry) => entry.target === target);
    },
    reset() {
      responses.clear();
      log.length = 0;
      authListeners.clear();
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

export function fakeClientModule() {
  return { supabase: createFakeSupabase(), fetchWithTimeout: fetch };
}
