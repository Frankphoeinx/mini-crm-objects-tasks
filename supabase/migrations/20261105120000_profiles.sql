-- Роли и профили. Роль читается только из этой таблицы: user_metadata пользователь меняет сам, верить ему нельзя.

-- Схемы нет в [api] schemas, поэтому Data API её не отдаёт.
create schema private;
-- Политики исполняются от роли запроса, ей нужен доступ к хелперам. Анониму доступа нет.
grant usage on schema private to authenticated;

create type public.user_role as enum ('manager', 'worker');

create table public.profiles (
  -- cascade срабатывает только у пользователя без задач и истории: на остальных ссылки запрещают удаление.
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (btrim(full_name) <> ''),
  role public.user_role not null
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated, service_role;
grant select on public.profiles to authenticated;
-- Профили пишет только scripts/seed-users.mjs секретным ключом.
grant select, insert, update on public.profiles to service_role;

-- Имена нужны всем вошедшим в истории и выборе исполнителя, регистрация закрыта. Запись клиентам запрещена.
create policy profiles_select_all on public.profiles
  for select to authenticated
  using (true);

-- security definer: политики других таблиц спрашивают роль, не завися от прав вызывающего на profiles.
create function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'manager'
  )
$$;

-- Новая функция по умолчанию открыта public, по схеме это не отменить: закрываем в конце каждой миграции.
revoke all on all functions in schema private from public;
grant execute on function private.is_manager() to authenticated;
