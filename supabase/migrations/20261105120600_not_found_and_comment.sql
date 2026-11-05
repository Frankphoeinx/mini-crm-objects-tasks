-- Коды ответа и комментарий возврата. Тела функций те же, меняются только эти две вещи.
-- PT404: сервис отдаёт его как HTTP 404. Прежний P0002 при запросе вручную выглядел как ошибка сервера 500.

create or replace function public.change_task_status(
  p_task_id uuid,
  p_to public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_is_manager boolean := private.is_manager();
  v_task public.tasks;
  v_from public.task_status;
  v_next public.task_status[];
  v_comment text;
begin
  -- Блокировка строки: два одновременных перехода идут по очереди, второй видит уже новый статус.
  select * into v_task
  from public.tasks
  where id = p_task_id and deleted_at is null
  for update;

  -- Чужому не говорим, что задача существует: ответ такой же, как у несуществующей.
  if not found or not (v_is_manager or coalesce(v_task.assignee_id = v_me, false)) then
    raise exception using errcode = 'PT404', message = 'Задача не найдена';
  end if;

  v_from := v_task.status;

  if v_from = 'accepted' then
    raise exception using errcode = 'P0001', message = 'Так нельзя: принятая задача больше не меняет статус.';
  end if;

  -- Матрица переходов ТЗ 2.3. Других переходов нет, обратных тоже.
  v_next := case v_from
    when 'new' then array['work']::public.task_status[]
    when 'work' then array['review']::public.task_status[]
    when 'review' then array['accepted', 'rework']::public.task_status[]
    when 'rework' then array['work']::public.task_status[]
  end;

  if not coalesce(p_to = any (v_next), false) then
    raise exception using
      errcode = 'P0001',
      message = 'Так нельзя: из «' || private.status_label(v_from) || '» задача идёт только в ' ||
        (select string_agg('«' || private.status_label(s) || '»', ' или ') from unnest(v_next) as s) || '.';
  end if;

  -- Принять и вернуть может любой постановщик. Остальные переходы только назначенный исполнитель,
  -- даже если это постановщик: своя задача идёт по тем же правилам.
  if p_to in ('accepted', 'rework') then
    if not v_is_manager then
      raise exception using errcode = '42501', message = 'Это действие доступно постановщику';
    end if;
  elsif not coalesce(v_task.assignee_id = v_me, false) then
    raise exception using errcode = '42501', message = 'Это может сделать только назначенный исполнитель';
  end if;

  v_comment := private.clean_text(p_comment, 'Комментарий', 2000, false);
  -- Причина должна читаться: невидимые символы и одна точка комментарием не считаются.
  if p_to = 'rework' and v_comment !~ '[[:alnum:]]' then
    raise exception using errcode = '23514', message = 'Напишите, что нужно исправить: без комментария вернуть нельзя.';
  end if;

  update public.tasks set status = p_to where id = p_task_id returning * into v_task;

  insert into public.task_events (task_id, kind, actor_id, from_status, to_status, comment)
  values (p_task_id, 'status', v_me, v_from, p_to, nullif(v_comment, ''));

  return v_task;
end
$$;

create or replace function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception using errcode = '42501', message = 'Это действие доступно постановщику';
  end if;

  update public.tasks set deleted_at = now()
  where id = p_task_id and deleted_at is null;
  if not found then
    raise exception using errcode = 'PT404', message = 'Задача не найдена';
  end if;

  insert into public.task_events (task_id, kind, actor_id)
  values (p_task_id, 'deleted', auth.uid());
end
$$;

create or replace function public.delete_object(p_object_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception using errcode = '42501', message = 'Это действие доступно постановщику';
  end if;

  -- Сначала объект: блокировка строки заставит ждать вставку задачи, которая уже идёт в этот объект.
  update public.objects set deleted_at = now()
  where id = p_object_id and deleted_at is null;
  if not found then
    raise exception using errcode = 'PT404', message = 'Объект не найден';
  end if;

  with deleted as (
    update public.tasks set deleted_at = now()
    where object_id = p_object_id and deleted_at is null
    returning id
  )
  insert into public.task_events (task_id, kind, actor_id)
  select id, 'deleted', auth.uid() from deleted;
end
$$;

create or replace function private.objects_before_write()
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
    raise exception using errcode = 'PT404', message = 'Объект не найден';
  end if;
  new.name := private.clean_text(new.name, 'Название', 200);
  new.address := private.clean_text(new.address, 'Адрес', 300);
  return new;
end
$$;

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
  else
    if old.deleted_at is not null then
      raise exception using errcode = 'PT404', message = 'Задача не найдена';
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

revoke all on all functions in schema private from public;
