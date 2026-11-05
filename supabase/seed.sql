-- Только локальная база: три пользователя. Данные загружает demo-data.sql, config.toml подключает его следом ([db.seed] sql_paths).
-- На удалённую базу этот файл не запускать (db push --include-seed в том числе): там пользователей создаёт scripts/seed-users.mjs.
-- Пароля здесь нет: значения только из окружения. Для входа на полном локальном стеке пароль задаёт scripts/seed-users.mjs.

with people (id, email, full_name, role) as (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'anna@stroyka.test', 'Анна Смирнова', 'manager'::public.user_role),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'petr@stroyka.test', 'Пётр Иванов', 'worker'::public.user_role),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'sergey@stroyka.test', 'Сергей Козлов', 'worker'::public.user_role)
), users as (
  -- Пустые строки вместо NULL в токенах: сервис входа не читает NULL в этих колонках.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  select
    '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
    '', '', '', '',
    '{"provider": "email", "providers": ["email"]}', '{}', now(), now()
  from people
), identities as (
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select
    id::text, id,
    jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
    'email', now(), now()
  from people
)
insert into public.profiles (id, full_name, role)
select id, full_name, role from people;
