-- Картинки в описании задачи. ТЗ, раздел 3: правила держатся и при обращении к Supabase мимо сайта.
-- Откат: drop policy task_images_select on storage.objects; drop policy task_images_insert on storage.objects;
-- drop function private.task_images_count(); бакет с файлами удаляется только через Storage API.

-- Закрытый бакет, предел 5 МБ. SVG не пускаем: в нём может быть код.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-images', 'task-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- security definer: счёт не зависит от правил чтения этой же таблицы.
create function private.task_images_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from storage.objects where bucket_id = 'task-images'
$$;

-- Постановщик читает любой файл бакета, исполнитель только файл из описания видимой ему задачи.
-- Подзапрос идёт через RLS задач: исполнитель видит только свои неудалённые. Описание правит только постановщик.
-- shortcut: полный просмотр описаний, для тестового объёма хватает; при росте нужна таблица связей файла и задачи.
create policy task_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-images'
    and (
      (select private.is_manager())
      or exists (
        select 1 from public.tasks t
        where position(storage.objects.name in t.description) > 0
      )
    )
  );

-- Вход на сайт открыт, бесплатный тариф 1 ГБ: 200 файлов по 5 МБ его не переполнят.
-- shortcut: параллельные загрузки могут чуть превысить предел, для защиты тарифа это неважно.
create policy task_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-images'
    and (select private.is_manager())
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.task_images_count()) < 200
  );

-- Правил UPDATE и DELETE нет: заменить или удалить файл не может ни один клиент.

revoke all on all functions in schema private from public;
grant execute on function private.task_images_count() to authenticated;
