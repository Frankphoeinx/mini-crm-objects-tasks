import { describe, expect, it } from 'vitest';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { ApiError, authErrorMessage, GENERAL_ERROR, NETWORK_ERROR, NOT_FOUND_ERROR, SESSION_ERROR, toApiError, unwrap, userMessage } from './errors';

describe('toApiError: разбор по кодам контракта', () => {
  it.each([
    // Текст базы по-русски показываем как есть.
    ['P0001', 400, 'Так нельзя: из «На проверке» задача идёт только в «Принята» или «На доработке».', 'refused', 'Так нельзя: из «На проверке» задача идёт только в «Принята» или «На доработке».', false],
    ['42501', 403, 'Это действие доступно постановщику', 'refused', 'Это действие доступно постановщику', false],
    ['42501', 403, 'Это может сделать только назначенный исполнитель', 'refused', 'Это может сделать только назначенный исполнитель', false],
    ['PT404', 400, 'Задача не найдена', 'not-found', 'Задача не найдена', false],
    ['23514', 400, 'Напишите, что нужно исправить: без комментария вернуть нельзя.', 'refused', 'Напишите, что нужно исправить: без комментария вернуть нельзя.', false],
    ['23514', 400, 'Снять исполнителя можно только у новой задачи.', 'refused', 'Снять исполнителя можно только у новой задачи.', false],
    // Те же коды с английским текстом самой базы: человеку показываем свой текст.
    ['42501', 403, 'new row violates row-level security policy for table "tasks"', 'refused', 'Это действие вам недоступно.', false],
    ['23514', 400, 'new row for relation "tasks" violates check constraint "tasks_assignee_required"', 'refused', 'Данные не прошли проверку. Проверьте, что заполнено, и попробуйте снова.', false],
    // Не найдено.
    ['PGRST116', 406, 'Cannot coerce the result to a single JSON object', 'not-found', NOT_FOUND_ERROR, false],
    ['22P02', 400, 'invalid input syntax for type uuid: "abc"', 'not-found', NOT_FOUND_ERROR, false],
    // Остальное: общий текст, техника не показывается.
    ['PGRST204', 400, "Could not find the 'x' column", 'unknown', GENERAL_ERROR, false],
    ['XX000', 500, 'internal error', 'server', GENERAL_ERROR, true],
    ['', 503, 'upstream', 'server', GENERAL_ERROR, true],
    // Сеть и сессия.
    ['', 0, 'TypeError: Failed to fetch', 'network', NETWORK_ERROR, true],
    ['PGRST301', 401, 'JWT expired', 'auth', SESSION_ERROR, false],
    ['42501', 401, 'permission denied for table tasks', 'auth', SESSION_ERROR, false],
  ])('%s, статус %i: %s', (code, status, message, kind, text, retryable) => {
    const error = toApiError({ code, message }, status);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe(text);
    expect(error.retryable).toBe(retryable);
    expect(error.message).not.toContain(code || '\0');
  });
});

describe('unwrap', () => {
  it('отдаёт данные', () => {
    expect(unwrap({ data: [1], error: null, status: 200 })).toEqual([1]);
  });

  it('бросает ApiError', () => {
    expect(() => unwrap({ data: null, error: { code: 'PT404', message: 'Задача не найдена' }, status: 400 })).toThrow(ApiError);
  });
});

it.each([
  [new ApiError('refused', 'Так нельзя'), 'Так нельзя'],
  [new TypeError('x is not a function'), GENERAL_ERROR],
  [null, GENERAL_ERROR],
])('userMessage не выдаёт технику', (error, expected) => {
  expect(userMessage(error)).toBe(expected);
});

describe('authErrorMessage: ошибка входа понятным текстом', () => {
  it.each([
    [new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), 'Неверная почта или пароль.'],
    [new AuthApiError('Too many', 429, 'over_request_rate_limit'), 'Слишком много попыток входа. Подождите минуту и попробуйте снова.'],
    [new AuthApiError('Banned', 403, 'user_banned'), 'Вход для этого пользователя закрыт. Обратитесь к администратору.'],
    [new AuthRetryableFetchError('Failed to fetch', 0), NETWORK_ERROR],
    [new AuthApiError('Oops', 500, 'unexpected_failure'), 'Не удалось войти. Попробуйте ещё раз.'],
    [null, 'Не удалось войти. Попробуйте ещё раз.'],
  ])('%#', (error, expected) => {
    expect(authErrorMessage(error)).toBe(expected);
  });
});
