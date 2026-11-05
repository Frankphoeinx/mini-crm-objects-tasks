-- ТЗ 2.1: исполнитель видит только объекты, где у него есть задачи.
-- Запись о смене объекта хранит имя прежнего объекта, поэтому её читает только постановщик. Смены статуса и другие правки видны как раньше.
drop policy task_events_select on public.task_events;

create policy task_events_select on public.task_events
  for select to authenticated
  using (
    task_id in (select t.id from public.tasks t)
    and (field is distinct from 'object' or (select private.is_manager()))
  );
