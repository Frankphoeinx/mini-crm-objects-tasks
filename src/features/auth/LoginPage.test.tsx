import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/shared/api/client';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { LoginPage } from './LoginPage';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

const emailField = () => screen.getByLabelText('Почта');
const passwordField = () => screen.getByLabelText('Пароль');
const submitButton = () => screen.getByRole('button', { name: /Войти|Входим/ });

beforeEach(() => fake.reset());

describe('вид экрана входа', () => {
  it('кран строит здание, плитка «Как идёт задача», регистрации нет', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Объектыи задачи');
    expect(document.querySelector('.l-crane .lg-bld')).toBeInTheDocument();
    expect(document.querySelector('.l-crane .job-load')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Как идёт задача' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('b')?.textContent)).toEqual(['Новая', 'В работе', 'На проверке', 'Принята']);
    expect(screen.getByText('Регистрации нет: пользователей заводит администратор.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /регистр/i })).not.toBeInTheDocument();
  });

  it('поля подписаны и подсказывают менеджеру паролей', () => {
    render(<LoginPage />);
    expect(emailField()).toHaveAttribute('autocomplete', 'username');
    expect(passwordField()).toHaveAttribute('autocomplete', 'current-password');
    expect(passwordField()).toHaveAttribute('type', 'password');
  });
});

describe('форма', () => {
  it('Enter и кнопка отправляют почту и пароль', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(emailField(), 'Anna@stroyka.test');
    await user.type(passwordField(), 'секрет{Enter}');
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'anna@stroyka.test', password: 'секрет' });
  });

  it.each([
    ['пустая форма', '', '', 'Почта'],
    ['нет пароля', 'a@b.c', '', 'Пароль'],
    ['нет почты', '', 'x', 'Почта'],
    ['почта из пробелов', '   ', 'x', 'Почта'],
  ])('%s: в сеть не идёт, фокус на пустом поле', async (_name, email, password, focused) => {
    const user = userEvent.setup();
    render(<LoginPage />);
    if (email) await user.type(emailField(), email);
    if (password) await user.type(passwordField(), password);
    await user.click(submitButton());
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Введите почту и пароль.');
    expect(screen.getByLabelText(focused)).toHaveFocus();
  });

  it.each([
    [new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), 'Неверная почта или пароль.'],
    [new AuthRetryableFetchError('Failed to fetch', 0), 'Нет связи с сервером. Проверьте интернет и попробуйте снова.'],
    [new AuthApiError('Too many', 429, 'over_request_rate_limit'), 'Слишком много попыток входа. Подождите минуту и попробуйте снова.'],
  ])('ошибка входа понятным текстом: %#', async (error, text) => {
    fake.auth.signInWithPassword.mockResolvedValueOnce({ error });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(emailField(), 'a@b.c');
    await user.type(passwordField(), 'x');
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordField()).toHaveAttribute('aria-describedby', 'bs-login-err');
    expect(passwordField()).toHaveFocus();
    expect(submitButton()).toBeEnabled();
  });

  it('ошибка уходит, когда начинают исправлять', async () => {
    fake.auth.signInWithPassword.mockResolvedValueOnce({ error: new AuthApiError('x', 400, 'invalid_credentials') });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(emailField(), 'a@b.c');
    await user.type(passwordField(), 'x{Enter}');
    await screen.findByRole('alert');
    await user.type(passwordField(), 'y');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(emailField()).not.toHaveAttribute('aria-invalid');
  });

  it('пока идёт отправка, второй запрос не уйдёт', async () => {
    let finish: (value: { error: unknown }) => void = () => {};
    fake.auth.signInWithPassword.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(emailField(), 'a@b.c');
    await user.type(passwordField(), 'x{Enter}');

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Входим…');
    await user.type(passwordField(), '{Enter}');
    expect(fake.auth.signInWithPassword).toHaveBeenCalledTimes(1);

    finish({ error: new AuthApiError('x', 400, 'invalid_credentials') });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });
});

describe('демо-вход (решение владельца)', () => {
  it('пароль не задан: блока нет', () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', '');
    render(<LoginPage />);
    expect(screen.queryByRole('heading', { name: 'Демо-пользователи' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Анна/ })).not.toBeInTheDocument();
  });

  it('список как задуман', () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', 'demo-value');
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Демо-пользователи' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Анна Смирнова Постановщик' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Пётр Иванов Исполнитель' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сергей Козлов Исполнитель' })).toBeInTheDocument();
  });

  it.each([
    ['Анна Смирнова Постановщик', 'anna@stroyka.test'],
    ['Пётр Иванов Исполнитель', 'petr@stroyka.test'],
    ['Сергей Козлов Исполнитель', 'sergey@stroyka.test'],
  ])('нажатие на «%s» сразу входит', async (name, email) => {
    vi.stubEnv('VITE_DEMO_PASSWORD', 'demo-value');
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name }));
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email, password: 'demo-value' });
    expect(screen.getByRole('button', { name })).toHaveClass('is-selected');
  });

  it('пароль не подставляется в поле и не виден на экране', async () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', 'demo-value');
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /Анна/ }));
    expect(passwordField()).toHaveValue('');
    expect(document.body).not.toHaveTextContent('demo-value');
  });

  it('отказ: подсказка выбрать пользователя, кнопки снова работают', async () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', 'demo-value');
    fake.auth.signInWithPassword.mockResolvedValueOnce({ error: new AuthApiError('x', 400, 'invalid_credentials') });
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /Анна/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверная почта или пароль. Выберите пользователя ниже.');
    expect(screen.getByRole('button', { name: /Пётр/ })).toBeEnabled();
  });

  it('пока идёт вход, остальные кнопки выключены', async () => {
    vi.stubEnv('VITE_DEMO_PASSWORD', 'demo-value');
    fake.auth.signInWithPassword.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /Анна/ }));
    expect(screen.getByRole('button', { name: /Пётр/ })).toBeDisabled();
    expect(submitButton()).toBeDisabled();
  });
});
