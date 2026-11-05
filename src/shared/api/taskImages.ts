import { useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import { ApiError, toApiError } from './errors';

const BUCKET = 'task-images';
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export const TASK_IMAGE_TYPES = Object.keys(EXTENSIONS).join(',');

/** Хранилище отвечает 4xx и на отказ правил, и на отсутствие файла: повторять такой запрос бессмысленно. */
function storageError(error: { status?: number; statusCode?: string; message: string }, refused: string) {
  const status = error.status ?? 0;
  if (status >= 400 && status < 500 && status !== 401) return new ApiError('refused', refused, error.statusCode ?? '', status);
  return toApiError({ message: error.message }, status);
}

/** Загружает картинку описания и возвращает её путь в закрытом хранилище. Тип и размер проверены до запроса. */
export async function uploadTaskImage(file: File, userId: string): Promise<string> {
  const extension = EXTENSIONS[file.type];
  if (!extension) throw new ApiError('refused', 'Можно добавить только картинку JPG, PNG или WebP.');
  if (file.size > MAX_BYTES) throw new ApiError('refused', 'Картинка больше 5 МБ. Выберите файл поменьше.');
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  // cacheControl 0: браузер не держит файл у себя. Кэш самого сервиса этим не управляется, границы описаны в docs/03.
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '0', upsert: false });
  if (error) throw storageError(error, 'Хранилище не приняло картинку: нет прав или закончилось место.');
  return path;
}

/**
 * Адрес картинки для показа. Файл читаем с токеном пользователя, подписанные ссылки не нужны: их можно переслать.
 * shortcut: адрес объекта живёт до перезагрузки страницы, для тестового объёма хватает.
 */
export function useTaskImage(path: string) {
  return useQuery({
    queryKey: ['task-image', path],
    // Чужой адрес или посторонняя строка не уходят в сеть.
    enabled: PATH.test(path),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error) throw storageError(error, 'Картинка недоступна.');
      return URL.createObjectURL(data);
    },
  });
}
