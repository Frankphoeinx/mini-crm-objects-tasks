import { isAuthRetryableFetchError } from '@supabase/supabase-js';

export const GENERAL_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.';
export const NETWORK_ERROR = 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
export const SESSION_ERROR = 'Сессия закончилась. Войдите снова.';
export const NOT_FOUND_ERROR = 'Запись не найдена или у вас нет к ней доступа.';
export const INVALID_CREDENTIALS_ERROR = 'Неверная почта или пароль.';

/** refused: база отказала и объяснила почему. Повторять такой запрос бессмысленно. */
export type ApiErrorKind = 'refused' | 'not-found' | 'auth' | 'network' | 'server' | 'unknown';

/** message всегда можно показать человеку: технический текст базы сюда не попадает. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: string;
  readonly status: number;

  constructor(kind: ApiErrorKind, message: string, code = '', status = 0) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
    this.status = status;
  }

  get retryable() {
    return this.kind === 'network' || this.kind === 'server';
  }
}

// Те же коды база отдаёт и без наших функций: RLS и CHECK пишут по-английски, такой текст человеку не показываем.
const REFUSED_FALLBACK: Record<string, string> = {
  P0001: 'Так нельзя: это действие сейчас недоступно.',
  '42501': 'Это действие вам недоступно.',
  '23514': 'Данные не прошли проверку. Проверьте, что заполнено, и попробуйте снова.',
};
// PGRST116: запрос .single() не нашёл строку. 22P02: в адресе не uuid, такой записи не может быть.
const NOT_FOUND_CODES = new Set(['P0002', 'PGRST116', '22P02']);

const isHumanText = (text: string) => /[а-яё]/i.test(text);

type DbErrorLike = { code?: string; message: string };

export function toApiError(error: DbErrorLike, status: number): ApiError {
  const code = error.code ?? '';
  const text = (fallback: string) => (isHumanText(error.message) ? error.message : fallback);

  if (status === 0) return new ApiError('network', NETWORK_ERROR, code, status);
  if (status === 401) return new ApiError('auth', SESSION_ERROR, code, status);
  if (NOT_FOUND_CODES.has(code)) return new ApiError('not-found', text(NOT_FOUND_ERROR), code, status);
  const refused = REFUSED_FALLBACK[code];
  if (refused) return new ApiError('refused', text(refused), code, status);
  if (status >= 500) return new ApiError('server', GENERAL_ERROR, code, status);
  return new ApiError('unknown', GENERAL_ERROR, code, status);
}

/** Единая точка разбора ответа PostgREST: данные или ApiError. */
export function unwrap<R extends { data: unknown; error: DbErrorLike | null; status: number }>(
  response: R,
): Extract<R, { error: null }>['data'] {
  if (response.error) throw toApiError(response.error, response.status);
  return response.data;
}

export function userMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERAL_ERROR;
}

export function authErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return NETWORK_ERROR;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'invalid_credentials') return INVALID_CREDENTIALS_ERROR;
  if (code === 'over_request_rate_limit') return 'Слишком много попыток входа. Подождите минуту и попробуйте снова.';
  if (code === 'user_banned') return 'Вход для этого пользователя закрыт. Обратитесь к администратору.';
  return 'Не удалось войти. Попробуйте ещё раз.';
}
