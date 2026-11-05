import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, manager, providers } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { supabase } from './client';
import { ApiError } from '../lib/errors';
import { uploadTaskImage, useTaskImage } from './taskImages';

vi.mock('./client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

const USER = '11111111-1111-1111-1111-111111111111';
const PATH = `${USER}/22222222-2222-2222-2222-222222222222.png`;
const MB5 = 5 * 1024 * 1024;

function makeFile(type: string, size = 10) {
  const file = new File(['x'], 'a', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const failure = (status: number | undefined) => ({ data: null, error: { message: 'storage says no', status } });

beforeEach(() => fake.reset());

describe('uploadTaskImage', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('%s: путь по контракту, настройки загрузки закреплены', async (type, extension) => {
    const file = makeFile(type);
    const path = await uploadTaskImage(file, USER);
    expect(path).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.${extension}$`));
    expect(fake.storage.from).toHaveBeenCalledWith('task-images');
    expect(fake.calls('storage')).toEqual([{ target: 'storage', method: 'upload', args: [path, file, { contentType: type, cacheControl: '0', upsert: false }] }]);
  });

  it.each([
    ['ровно 5 МБ', MB5, true],
    ['на байт больше', MB5 + 1, false],
    ['пустой файл', 0, true],
  ])('размер %s', async (_name, size, accepted) => {
    const upload = uploadTaskImage(makeFile('image/png', size), USER);
    if (accepted) await expect(upload).resolves.toBeTruthy();
    else await expect(upload).rejects.toThrow('Картинка больше 5 МБ');
    expect(fake.calls('storage')).toHaveLength(accepted ? 1 : 0);
  });

  it.each(['image/svg+xml', 'image/gif', 'application/pdf', 'text/html', ''])('тип «%s» отвергнут до запроса', async (type) => {
    await expect(uploadTaskImage(makeFile(type), USER)).rejects.toThrow('только картинку JPG, PNG или WebP');
    expect(fake.calls('storage')).toEqual([]);
  });

  it.each([
    ['отказ правил', 403, 'refused', 'нет прав или закончилось место'],
    ['отказ с кодом 400', 400, 'refused', 'нет прав или закончилось место'],
    ['сессия кончилась', 401, 'auth', 'Сессия закончилась'],
    ['сбой сервера', 500, 'server', 'Что-то пошло не так'],
    ['нет сети', undefined, 'network', 'Нет связи'],
  ])('%s: понятный текст', async (_name, status, kind, text) => {
    fake.respond('storage', failure(status));
    const error = await uploadTaskImage(makeFile('image/png'), USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind });
    expect((error as ApiError).message).toContain(text);
  });
});

describe('useTaskImage', () => {
  const show = (path: string) => renderHook(() => useTaskImage(path), { wrapper: providers({ me: manager, queryClient: createTestQueryClient() }) });

  it('файл читается из хранилища и даёт адрес объекта', async () => {
    const { result } = show(PATH);
    await waitFor(() => expect(result.current.data).toBe('blob:test-image'));
    expect(fake.calls('storage')).toEqual([{ target: 'storage', method: 'download', args: [PATH] }]);
  });

  it.each([
    'https://evil.example/x.png',
    '//evil.example/x.png',
    'javascript:alert(1)',
    `${USER}/../22222222-2222-2222-2222-222222222222.png`,
    `${USER}/22222222-2222-2222-2222-222222222222.svg`,
    `${PATH}?x=1`,
    '',
  ])('«%s» не вызывает запроса', async (path) => {
    const { result } = show(path);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(fake.calls('storage')).toEqual([]);
  });

  it('отказ хранилища не повторяется', async () => {
    fake.respond('storage', failure(400));
    const { result } = show(PATH);
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect((result.current.error as ApiError).retryable).toBe(false);
  });
});
