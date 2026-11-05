-- Два постановщика правят один текст: второй не должен молча затереть первого.
-- Номер версии текста растёт только от правки названия или описания: смена статуса и исполнителя конфликта не дают.
-- Сайт обновляет запись с условием на номер. Устарел: ноль строк, сайт говорит об этом и оставляет набранное в поле.
alter table public.tasks add column text_version integer not null default 0;

create or replace function private.tasks_before_write()
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
    new.text_version := 0;
  else
    if old.deleted_at is not null then
      raise exception using errcode = 'PT404', message = 'Задача не найдена';
    end if;
    if new.title is distinct from old.title or new.description is distinct from old.description then
      new.text_version := old.text_version + 1;
    else
      new.text_version := old.text_version;
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
      raise exception using errcode = 'PT404', message = 'Объект не найден';
    end if;
  end if;

  new.title := private.clean_text(new.title, 'Название', 200);
  new.description := private.clean_text(new.description, 'Описание', 5000, false);
  return new;
end
$$;

create or replace view public.task_board
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
  r.created_at as last_return_at,
  t.text_version
from public.tasks t
left join lateral (
  select (count(*) over ())::integer as return_count, e.comment, e.actor_id, e.created_at
  from public.task_events e
  where e.task_id = t.id and e.kind = 'status' and e.to_status = 'rework'
  order by e.created_at desc, e.id desc
  limit 1
) r on true;

revoke all on all functions in schema private from public;
