-- Объекты и задачи. Объединены в одну миграцию: политика объектов опирается на задачи.

create type public.task_status as enum ('new', 'work', 'review', 'rework', 'accepted');

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  address text not null check (btrim(address) <> ''),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects (id),
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  assignee_id uuid references public.profiles (id),
  status public.task_status not null default 'new',
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tasks_assignee_required check (assignee_id is not null or status = 'new')
);

-- Внешние ключи и колонки политик. Частичные индексы отвечают условию deleted_at is null и порядку списков.
create index objects_created_by_idx on public.objects (created_by);
create index objects_live_idx on public.objects (created_at desc) where deleted_at is null;
create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index tasks_author_id_idx on public.tasks (author_id);
create index tasks_live_idx on public.tasks (created_at desc) where deleted_at is null;

alter table public.objects enable row level security;
alter table public.tasks enable row level security;

-- Клиент пишет только перечисленные колонки: status, deleted_at, author_id, created_by, created_at и id ему недоступны.
revoke all on public.objects, public.tasks from anon, authenticated, service_role;
grant select on public.objects, public.tasks to authenticated, service_role;
grant insert (name, address), update (name, address) on public.objects to authenticated;
grant insert (object_id, title, description, assignee_id),
      update (title, description, object_id, assignee_id) on public.tasks to authenticated;

-- Объекты, где у текущего пользователя есть неудалённая задача.
-- security definer и setof: подзапрос считается один раз на запрос, а не на каждую строку объектов.
create function private.my_object_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select object_id from public.tasks
  where assignee_id = (select auth.uid()) and deleted_at is null
$$;

grant execute on function private.my_object_ids() to authenticated;

-- Удалённое не видит никто. Постановщик видит все объекты, исполнитель только те, где есть его задача.
create policy objects_select on public.objects
  for select to authenticated
  using (
    deleted_at is null
    and ((select private.is_manager()) or id in (select private.my_object_ids()))
  );

-- Создаёт и правит только постановщик, удалённое править нельзя.
create policy objects_insert on public.objects
  for insert to authenticated
  with check ((select private.is_manager()));

create policy objects_update on public.objects
  for update to authenticated
  using (deleted_at is null and (select private.is_manager()))
  with check (deleted_at is null and (select private.is_manager()));

-- Постановщик видит все задачи, исполнитель только назначенные ему.
-- Задачу без исполнителя условие assignee_id = ... не пропускает: её видят только постановщики.
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and ((select private.is_manager()) or assignee_id = (select auth.uid()))
  );

-- Создаёт и правит только постановщик. Удаления нет ни у кого: только delete_task и delete_object.
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select private.is_manager()));

create policy tasks_update on public.tasks
  for update to authenticated
  using (deleted_at is null and (select private.is_manager()))
  with check (deleted_at is null and (select private.is_manager()));

-- Сайт показывает текст ошибки 23514 человеку, поэтому пустое и слишком длинное ловим с русским текстом до CHECK.
create function private.clean_text(p_value text, p_label text, p_max integer, p_required boolean default true)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_value, ''), E' \t\r\n');
begin
  if p_required and v_text = '' then
    raise exception using errcode = '23514', message = p_label || ' не может быть пустым.';
  end if;
  if char_length(v_text) > p_max then
    raise exception using errcode = '23514', message = p_label || ': не больше ' || p_max || ' знаков.';
  end if;
  return v_text;
end
$$;

-- База сама ставит автора и время: клиентское значение не проходит, даже если обойдёт права на колонки.
create function private.objects_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_manager() then
      raise exception using errcode = '42501', message = 'Это действие доступно постановщику';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.deleted_at := null;
  elsif old.deleted_at is not null then
    raise exception using errcode = 'P0002', message = 'Объект не найден';
  end if;
  new.name := private.clean_text(new.name, 'Название', 200);
  new.address := private.clean_text(new.address, 'Адрес', 300);
  return new;
end
$$;

create trigger objects_before_write
  before insert or update on public.objects
  for each row execute function private.objects_before_write();

-- База сама ставит статус, автора и время новой задаче и держит правила правки.
create function private.tasks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_manager() then
      raise exception using errcode = '42501', message = 'Это действие доступно постановщику';
    end if;
    new.status := 'new';
    new.author_id := auth.uid();
    new.created_at := now();
    new.deleted_at := null;
  else
    if old.deleted_at is not null then
      raise exception using errcode = 'P0002', message = 'Задача не найдена';
    end if;
    if new.assignee_id is null and new.status <> 'new' then
      raise exception using errcode = '23514', message = 'Снять исполнителя можно только у новой задачи.';
    end if;
  end if;

  if tg_op = 'INSERT' or new.object_id is distinct from old.object_id then
    -- for share конфликтует с update в delete_object: задача не попадёт в объект, который удаляют в этот момент.
    perform 1 from public.objects
    where id = new.object_id and deleted_at is null
    for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'Объект не найден';
    end if;
  end if;

  new.title := private.clean_text(new.title, 'Название', 200);
  new.description := private.clean_text(new.description, 'Описание', 5000, false);
  return new;
end
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function private.tasks_before_write();

revoke all on all functions in schema private from public;
