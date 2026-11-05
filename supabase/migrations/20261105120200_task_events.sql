-- История задач и вид для досок. Клиент историю только читает, пишут функции и триггеры базы.

create type public.task_event_kind as enum ('created', 'status', 'edit', 'deleted');
create type public.task_event_field as enum ('title', 'description', 'object', 'assignee');

create table public.task_events (
  id bigint generated always as identity primary key,
  -- restrict: задачу и автора события удалить нельзя, пока есть история.
  task_id uuid not null references public.tasks (id) on delete restrict,
  kind public.task_event_kind not null,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  from_status public.task_status,
  to_status public.task_status,
  comment text,
  field public.task_event_field,
  old_value text,
  new_value text,
  created_at timestamptz not null default now(),
  constraint task_events_shape check (
    case kind
      when 'created' then from_status is null and to_status = 'new' and field is null
      when 'status' then from_status is not null and to_status is not null and field is null
      when 'edit' then field is not null and from_status is null and to_status is null
      when 'deleted' then field is null and from_status is null and to_status is null
    end
  )
);

-- Индекс покрывает внешний ключ, политику и порядок истории внутри задачи.
create index task_events_task_id_idx on public.task_events (task_id, created_at, id);
create index task_events_actor_id_idx on public.task_events (actor_id);
-- Причина возврата и счётчик в task_board.
create index task_events_returns_idx on public.task_events (task_id, created_at desc, id desc)
  where kind = 'status' and to_status = 'rework';

alter table public.task_events enable row level security;

-- Писать не может никто из клиентов и секретный ключ тоже. Функции и триггеры работают от владельца таблицы.
revoke all on public.task_events from anon, authenticated, service_role;
grant select on public.task_events to authenticated, service_role;
revoke all on sequence public.task_events_id_seq from anon, authenticated, service_role;

-- История видна тому, кто видит задачу: подзапрос к tasks проходит через её политику, условий не дублируем.
create policy task_events_select on public.task_events
  for select to authenticated
  using (task_id in (select t.id from public.tasks t));

-- Второй замок поверх прав: сработает и для того, кому права выдадут по ошибке.
-- На уровне оператора, чтобы ловить и TRUNCATE, и команды, не задевшие ни одной строки.
create function private.forbid_history_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Историю нельзя изменить или удалить.';
end
$$;

create trigger task_events_immutable
  before update or delete or truncate on public.task_events
  for each statement execute function private.forbid_history_change();

create function private.tasks_journal_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_events (task_id, kind, actor_id, to_status)
  values (new.id, 'created', new.author_id, new.status);
  return null;
end
$$;

create trigger tasks_journal_created
  after insert on public.tasks
  for each row execute function private.tasks_journal_created();

-- Каждая правка отдельным событием. Объект и исполнителя пишем именами на момент правки: позже их могут переименовать.
create function private.tasks_journal_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_events (task_id, kind, actor_id, field, old_value, new_value)
  select new.id, 'edit', auth.uid(), c.field::public.task_event_field, c.old_value, c.new_value
  from (
    values
      ('title', new.title is distinct from old.title, old.title, new.title),
      ('description', new.description is distinct from old.description, old.description, new.description),
      ('object', new.object_id is distinct from old.object_id,
        (select o.name from public.objects o where o.id = old.object_id),
        (select o.name from public.objects o where o.id = new.object_id)),
      ('assignee', new.assignee_id is distinct from old.assignee_id,
        coalesce((select p.full_name from public.profiles p where p.id = old.assignee_id), 'Не назначен'),
        coalesce((select p.full_name from public.profiles p where p.id = new.assignee_id), 'Не назначен'))
  ) as c (field, changed, old_value, new_value)
  where c.changed;
  return null;
end
$$;

-- Смена статуса и удаление эти колонки не трогают, поэтому в журнал правок не попадают.
create trigger tasks_journal_edit
  after update of title, description, object_id, assignee_id on public.tasks
  for each row execute function private.tasks_journal_edit();

-- security_invoker: вид читает таблицы от роли запроса, поэтому действуют политики tasks и task_events.
create view public.task_board
with (security_invoker = true)
as
select
  t.id,
  t.object_id,
  t.title,
  t.description,
  t.assignee_id,
  t.status,
  t.author_id,
  t.created_at,
  t.deleted_at,
  coalesce(r.return_count, 0) as return_count,
  r.comment as last_return_comment,
  r.actor_id as last_return_by,
  r.created_at as last_return_at
from public.tasks t
left join lateral (
  select (count(*) over ())::integer as return_count, e.comment, e.actor_id, e.created_at
  from public.task_events e
  where e.task_id = t.id and e.kind = 'status' and e.to_status = 'rework'
  order by e.created_at desc, e.id desc
  limit 1
) r on true;

revoke all on public.task_board from anon, authenticated, service_role;
grant select on public.task_board to authenticated, service_role;

revoke all on all functions in schema private from public;
