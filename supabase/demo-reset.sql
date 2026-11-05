-- Сброс тестовой площадки: стирает все объекты, задачи и историю, включая скрытые. Только для демо-данных.
-- Запускается от роли postgres, клиентам такое недоступно: история защищена триггерами, а здесь они выключены.
-- Порядок: этот файл, затем supabase/demo-data.sql. Пользователи и картинки в хранилище остаются.
do $$
begin
  set local session_replication_role = replica;
  delete from public.task_events;
  delete from public.tasks;
  delete from public.objects;
end
$$;
