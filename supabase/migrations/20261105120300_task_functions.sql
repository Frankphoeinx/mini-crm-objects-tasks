-- Смена статуса и мягкое удаление. security definer: клиент не имеет прав на эти колонки и на запись в историю,
-- поэтому единственный путь для него лежит через проверки ниже.

create function private.status_label(p_status public.task_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'new' then 'Новая'
    when 'work' then 'В работе'
    when 'review' then 'На проверке'
    when 'rework' then 'На доработке'
    when 'accepted' then 'Принята'
  end
$$;

create function public.change_task_status(
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
    raise exception using errcode = 'P0002', message = 'Задача не найдена';
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
  if p_to = 'rework' and v_comment = '' then
    raise exception using errcode = '23514', message = 'Напишите, что нужно исправить: без комментария вернуть нельзя.';
  end if;

  update public.tasks set status = p_to where id = p_task_id returning * into v_task;

  insert into public.task_events (task_id, kind, actor_id, from_status, to_status, comment)
  values (p_task_id, 'status', v_me, v_from, p_to, nullif(v_comment, ''));

  return v_task;
end
$$;

create function public.delete_task(p_task_id uuid)
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
    raise exception using errcode = 'P0002', message = 'Задача не найдена';
  end if;

  insert into public.task_events (task_id, kind, actor_id)
  values (p_task_id, 'deleted', auth.uid());
end
$$;

-- Объект скрывает свои задачи. Уже удалённые задачи не трогаем: второго события у них не будет.
create function public.delete_object(p_object_id uuid)
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
    raise exception using errcode = 'P0002', message = 'Объект не найден';
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

revoke all on all functions in schema private from public;

-- Новые функции в public по умолчанию открыты анониму и секретному ключу: закрываем явно.
revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon, service_role;
revoke all on function public.delete_task(uuid) from public, anon, service_role;
revoke all on function public.delete_object(uuid) from public, anon, service_role;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.delete_object(uuid) to authenticated;
