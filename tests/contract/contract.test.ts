// Стык сайта и настоящего Supabase: коды и ответы, на которые опирается разбор ошибок. Тесты сайта идут с подменой клиента, тесты базы в SQL, этот стык видит только настоящий сервис.
// Только чтение и запросы, которые база отказывает: данные не меняются, поэтому набор можно запускать на рабочем проекте.
// Запуск: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... DEMO_PASSWORD=... npm run test:contract
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { toApiError } from '../../src/shared/lib/errors';

declare const process: { env: Record<string, string | undefined> };

const { SUPABASE_URL: url = '', SUPABASE_PUBLISHABLE_KEY: key = '', DEMO_PASSWORD: password = '' } = process.env;
const NOWHERE = '00000000-0000-0000-0000-000000000000';
const BOARD_COLUMNS =
  'id,object_id,title,description,assignee_id,status,author_id,created_at,deleted_at,return_count,last_return_comment,last_return_by,last_return_at,text_version';

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function signedIn(name: string) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email: `${name}@stroyka.test`, password });
  expect(error).toBeNull();
  return c;
}

let anon: SupabaseClient, anna: SupabaseClient, petr: SupabaseClient, sergey: SupabaseClient;
let annaId: string, petrId: string;
type Row = { id: string; status: string; assignee_id: string | null };
let board: Row[];

beforeAll(async () => {
  expect(url && key && password, 'нужны SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, DEMO_PASSWORD').toBeTruthy();
  anon = client();
  anna = await signedIn('anna');
  petr = await signedIn('petr');
  sergey = await signedIn('sergey');
  annaId = (await anna.auth.getUser()).data.user?.id ?? '';
  petrId = (await petr.auth.getUser()).data.user?.id ?? '';
  board = (await anna.from('task_board').select('id,status,assignee_id')).data ?? [];
  expect(board.length).toBeGreaterThan(0);
});

const taskIn = (status: string) => {
  const row = board.find((t) => t.status === status);
  if (!row) throw new Error(`на проекте нет задачи в статусе ${status}`);
  return row;
};

describe('вид и функции, на которые опирается сайт', () => {
  it('в task_board есть все колонки сайта', async () => {
    const { error } = await anna.from('task_board').select(BOARD_COLUMNS).limit(1);
    expect(error).toBeNull();
  });
});

describe('коды отказов превращаются в те ошибки, которые ждёт сайт', () => {
  it('несуществующая задача: HTTP 404, «не найдено»', async () => {
    const { error, status } = await petr.rpc('change_task_status', { p_task_id: NOWHERE, p_to: 'work' });
    expect(status).toBe(404);
    expect(toApiError(error as never, status)).toMatchObject({ kind: 'not-found', message: 'Задача не найдена' });
  });

  it('чужая задача отвечает так же, как несуществующая', async () => {
    const foreign = board.find((t) => t.assignee_id && t.assignee_id !== petrId);
    const { error, status } = await petr.rpc('change_task_status', { p_task_id: foreign?.id, p_to: 'review' });
    expect(status).toBe(404);
    expect(error?.code).toBe('PT404');
  });

  it('запрещённый переход: отказ с объяснением', async () => {
    const { error, status } = await anna.rpc('change_task_status', { p_task_id: taskIn('work').id, p_to: 'rework', p_comment: 'проверка' });
    expect(status).toBe(400);
    expect(toApiError(error as never, status)).toMatchObject({ kind: 'refused' });
    expect(error?.message).toContain('Так нельзя');
  });

  it.each(['', '   ', '.', '​'])('возврат с комментарием %j: отказ', async (comment) => {
    const { error, status } = await anna.rpc('change_task_status', { p_task_id: taskIn('review').id, p_to: 'rework', p_comment: comment });
    expect(error?.code).toBe('23514');
    expect(toApiError(error as never, status).kind).toBe('refused');
  });

  it('прямая правка статуса: 403, отказ', async () => {
    const { error, status } = await anna.from('tasks').update({ status: 'accepted' }).eq('id', taskIn('work').id).select().single();
    expect(status).toBe(403);
    expect(toApiError(error as never, status).kind).toBe('refused');
  });

  it('правка мимо RLS: ноль строк, сайт видит «не найдено»', async () => {
    const { error, status } = await petr.from('tasks').update({ title: 'Взлом' }).eq('id', board[0]?.id).select().single();
    expect(error).not.toBeNull();
    expect(toApiError(error as never, status).kind).not.toBe('server');
  });

  it('устаревшая версия текста: ноль строк, сайт покажет конфликт', async () => {
    const { error, status } = await anna.from('tasks').update({ description: 'Устарело' }).eq('id', board[0]?.id).eq('text_version', -1).select().single();
    expect(error?.code).toBe('PGRST116');
    expect(toApiError(error as never, status).kind).toBe('not-found');
  });
});

describe('доступ', () => {
  it('регистрация закрыта', async () => {
    const { error } = await client().auth.signUp({ email: 'contract-test@example.com', password: 'Qwerty12345!' });
    expect(error).not.toBeNull();
  });

  it.each(['tasks', 'objects', 'task_events', 'profiles', 'task_board'])('без входа %s не читается', async (table) => {
    const { data, error } = await anon.from(table).select('*').limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('исполнитель видит только свои задачи', async () => {
    const { data } = await petr.from('task_board').select('id,assignee_id');
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((t) => t.assignee_id === petrId)).toBe(true);
  });

  it.each([
    ['правка', () => anna.from('task_events').update({ comment: 'подделка' }).eq('task_id', NOWHERE).select()],
    ['удаление', () => anna.from('task_events').delete().eq('task_id', NOWHERE).select()],
    ['вставка', () => anna.from('task_events').insert({ task_id: NOWHERE, kind: 'status', actor_id: annaId }).select()],
  ])('история: %s отказана', async (_name, request) => {
    const { error, status } = await request();
    expect(error).not.toBeNull();
    expect(status).toBe(403);
  });

  it('исполнитель не меняет себе роль', async () => {
    const { data, error } = await petr.from('profiles').update({ role: 'manager' }).eq('id', petrId).select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

describe('хранилище картинок', () => {
  const png = new Blob(['x'], { type: 'image/png' });
  const file = (owner: string, ext = 'png') => `${owner}/${crypto.randomUUID()}.${ext}`;

  it.each([
    ['исполнитель', () => petr.storage.from('task-images').upload(file(petrId), png)],
    ['без входа', () => anon.storage.from('task-images').upload(file(NOWHERE), png)],
    ['постановщик в чужую папку', () => anna.storage.from('task-images').upload(file(petrId), png)],
    ['постановщик с типом SVG', () => anna.storage.from('task-images').upload(file(annaId, 'svg'), new Blob(['<svg/>'], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml' })],
  ])('загрузка отказана: %s', async (_name, request) => {
    expect((await request()).error).not.toBeNull();
  });

  it('файла вне описаний исполнитель и посторонний не получают', async () => {
    expect((await sergey.storage.from('task-images').download(file(annaId))).error).not.toBeNull();
    expect((await anon.storage.from('task-images').download(file(annaId))).error).not.toBeNull();
  });
});
