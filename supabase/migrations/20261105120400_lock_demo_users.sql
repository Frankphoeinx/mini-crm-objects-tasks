-- Пароль демо-пользователей лежит в собранном коде сайта (решение владельца: тестовая площадка).
-- Значит, любой посетитель может войти и запросом updateUser сменить пароль или почту, закрыв вход всем остальным.
-- Первый пароль задать можно: локально seed.sql создаёт пользователей без пароля. Сменить его можно только новой миграцией.
create function private.forbid_demo_user_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Пароль и почту демо-пользователя менять нельзя.';
end
$$;

create trigger demo_users_locked
  before update of encrypted_password, email on auth.users
  for each row
  when (
    old.email in ('anna@stroyka.test', 'petr@stroyka.test', 'sergey@stroyka.test')
    and (
      new.email is distinct from old.email
      or (coalesce(old.encrypted_password, '') <> '' and new.encrypted_password is distinct from old.encrypted_password)
    )
  )
  execute function private.forbid_demo_user_change();

revoke all on all functions in schema private from public;
