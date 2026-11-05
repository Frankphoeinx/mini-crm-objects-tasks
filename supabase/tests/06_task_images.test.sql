-- Кто читает и пишет файлы бакета task-images. Всё под ролью, как запрос мимо сайта.
begin;
select plan(59);
\ir fixture.psql

-- Отказ RLS проверяем по тексту: код 42501 дал бы и отказ в правах на функцию.
\set rls 'new row violates row-level security policy for table "objects"'
-- Прямой DELETE останавливает триггер Storage. Storage API снимает его этим флагом, дальше решает RLS: её и проверяем.
set local storage.allow_delete_query = 'true';

create function pg_temp.file(p_owner text, p_name text) returns text
language sql immutable as $$ select pg_temp.id(p_owner) || '/' || pg_temp.id(p_name) || '.png' $$;

create function pg_temp.put(p_path text, p_bucket text default 'task-images') returns text
language sql immutable as $$ select format('insert into storage.objects (bucket_id, name) values (%L, %L)', p_bucket, p_path) $$;

create function pg_temp.sees(p_path text, p_bucket text default 'task-images') returns boolean
language sql as $$ select exists (select 1 from storage.objects where bucket_id = p_bucket and name = p_path) $$;

create function pg_temp.affected_as(p_who text, p_sql text) returns integer
language plpgsql as $$
begin
  perform pg_temp.login(p_who);
  return pg_temp.affected(p_sql);
end
$$;

-- Настройки бакета и полный список правил таблицы.
select is((select public from storage.buckets where id = 'task-images'), false, 'бакет закрытый');
select is((select file_size_limit from storage.buckets where id = 'task-images'), 5242880::bigint, 'предел файла 5 МБ');
select is(
  (select allowed_mime_types from storage.buckets where id = 'task-images'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'типы только jpeg, png, webp'
);
select ok((select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), 'RLS на storage.objects включён');
select results_eq(
  $$ select polname::text collate "default", polcmd::text, polroles = array['authenticated'::regrole::oid]
     from pg_policy where polrelid = 'storage.objects'::regclass
     order by 1 $$,
  $$ values ('task_images_insert', 'a', true), ('task_images_select', 'r', true) $$,
  'на storage.objects только INSERT и SELECT и только для вошедших'
);

insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
insert into storage.objects (bucket_id, name) values
  ('task-images', pg_temp.file('boss', 'unlinked')),
  ('task-images', pg_temp.file('boss', 'removed')),
  ('task-images', pg_temp.file('boss', 'deleted')),
  -- Тот же путь, что у файла из описания, но в другом бакете.
  ('other-bucket', pg_temp.file('boss', 'linked'));

-- Загрузка.
select pg_temp.login('boss');
select lives_ok(pg_temp.put(pg_temp.file('boss', 'linked')), 'постановщик загружает в свою папку');
select throws_ok(pg_temp.put(pg_temp.file('boss2', 'x')), '42501', :'rls', 'постановщик не загружает в чужую папку');
select throws_ok(pg_temp.put('x.png'), '42501', :'rls', 'постановщик не загружает без папки');
select throws_ok(pg_temp.put('x/' || pg_temp.file('boss', 'x')), '42501', :'rls', 'своя папка должна быть первой в пути');
select throws_ok(pg_temp.put(pg_temp.file('boss', 'x'), 'other-bucket'), '42501', :'rls', 'постановщик не загружает в другой бакет');
select pg_temp.login('boss2');
select lives_ok(pg_temp.put(pg_temp.file('boss2', 'foreign')), 'второй постановщик загружает в свою папку');

select pg_temp.login('w1');
select throws_ok(pg_temp.put(pg_temp.file('w1', 'x')), '42501', :'rls', 'исполнитель не загружает даже в свою папку');
select pg_temp.login('w1', '{"user_metadata": {"role": "manager"}, "app_metadata": {"role": "manager"}}');
select throws_ok(pg_temp.put(pg_temp.file('w1', 'x')), '42501', :'rls', 'метаданные токена не дают загрузить');
select pg_temp.login('ghost');
select throws_ok(pg_temp.put(pg_temp.file('ghost', 'x')), '42501', :'rls', 'вошедший без профиля не загружает');
select pg_temp.login_anon();
select throws_ok(pg_temp.put(pg_temp.file('boss', 'x')), '42501', :'rls', 'аноним не загружает');

-- Описания правит постановщик обычным путём. У w1 один файл, у w2 два.
select pg_temp.login('boss');
update public.tasks set description = 'Смотри ![](' || pg_temp.file('boss', 'linked') || ') и дальше'
where id = pg_temp.id('task-a');
update public.tasks set description = '![](' || pg_temp.file('boss', 'removed') || ') ![](' || pg_temp.file('boss', 'deleted') || ')'
where id = pg_temp.id('task-b');

-- Чтение: постановщик читает любой файл бакета.
select ok(pg_temp.sees(pg_temp.file('boss', 'linked')), 'постановщик читает свой файл');
select ok(pg_temp.sees(pg_temp.file('boss', 'unlinked')), 'постановщик читает файл, не связанный с задачей');
select ok(pg_temp.sees(pg_temp.file('boss2', 'foreign')), 'постановщик читает файл другого постановщика');
select pg_temp.login('boss2');
select ok(pg_temp.sees(pg_temp.file('boss', 'linked')), 'второй постановщик читает файл первого');

-- Чтение: исполнитель только из описания своей задачи.
select pg_temp.login('w1');
select ok(pg_temp.sees(pg_temp.file('boss', 'linked')), 'назначенный исполнитель читает файл из описания');
select is((select count(*)::int from storage.objects), 1, 'в списке исполнитель видит только этот файл');
select ok(not pg_temp.sees(pg_temp.file('boss', 'unlinked')), 'файл, не связанный с задачей, исполнитель не читает');
select ok(not pg_temp.sees(pg_temp.file('boss', 'removed')), 'файл чужой задачи исполнитель не читает');
select is(
  pg_temp.affected(format('update public.tasks set description = %L where id = %L', pg_temp.file('boss', 'unlinked'), pg_temp.id('task-a'))),
  0, 'исполнитель не дописывает путь в описание своей задачи'
);
select ok(not pg_temp.sees(pg_temp.file('boss', 'unlinked')), 'и после этой попытки файл недоступен');
select pg_temp.login('w1', '{"user_metadata": {"role": "manager"}, "app_metadata": {"role": "manager"}}');
select ok(not pg_temp.sees(pg_temp.file('boss', 'unlinked')), 'метаданные токена не расширяют чтение');
select pg_temp.login('w2');
select ok(not pg_temp.sees(pg_temp.file('boss', 'linked')), 'другой исполнитель файл не читает');
select pg_temp.login('ghost');
select ok(not pg_temp.sees(pg_temp.file('boss', 'linked')), 'вошедший без профиля файл не читает');
select pg_temp.login_anon();
select ok(not pg_temp.sees(pg_temp.file('boss', 'linked')), 'аноним файл не читает');
select is((select count(*)::int from storage.objects), 0, 'аноним не видит ни одного файла');

-- Другие бакеты.
select pg_temp.login('boss');
select ok(not pg_temp.sees(pg_temp.file('boss', 'linked'), 'other-bucket'), 'постановщик не читает другой бакет');
select pg_temp.login('w1');
select ok(not pg_temp.sees(pg_temp.file('boss', 'linked'), 'other-bucket'), 'путь из описания не открывает файл другого бакета');
select is(
  pg_temp.affected_as('boss', $$ update storage.objects set metadata = '{}' where bucket_id = 'other-bucket' $$),
  0, 'постановщик не меняет файлы другого бакета'
);
select is(
  pg_temp.affected_as('boss', $$ update storage.buckets set public = true where id = 'task-images' $$),
  0, 'постановщик не открывает бакет'
);

-- Заменить и удалить нельзя никому, в том числе тем, кто файл читает.
select is(pg_temp.affected_as(who, q), 0, who || ': ' || label)
from unnest(array['boss', 'boss2', 'w1', 'w2', 'ghost']) as who,
  (values
    ($$ update storage.objects set metadata = '{"взлом": true}' where bucket_id = 'task-images' $$, 'файл не заменить'),
    ($$ delete from storage.objects where bucket_id = 'task-images' $$, 'файл не удалить')
  ) as c (q, label);
select pg_temp.login('boss');
select throws_ok(
  pg_temp.put(pg_temp.file('boss', 'linked')) || $$ on conflict (bucket_id, name collate "C") where archived_at is null do update set metadata = '{"взлом": true}' $$,
  '42501', null, 'автор не заменяет файл повторной загрузкой'
);
select pg_temp.login_anon();
select is(pg_temp.affected($$ update storage.objects set metadata = '{"взлом": true}' $$), 0, 'аноним: файл не заменить');
select is(pg_temp.affected('delete from storage.objects'), 0, 'аноним: файл не удалить');
select pg_temp.logout();
select is(
  (select count(*)::int from storage.objects
   where name in (pg_temp.file('boss', 'linked'), pg_temp.file('boss', 'unlinked')) and bucket_id = 'task-images' and metadata is null),
  2, 'файлы на месте и не изменены'
);

-- Файл убрали из описания, задачу удалили, исполнителя сменили.
select pg_temp.login('w2');
select ok(pg_temp.sees(pg_temp.file('boss', 'removed')), 'до правки описания исполнитель читает файл');
select ok(pg_temp.sees(pg_temp.file('boss', 'deleted')), 'до удаления задачи исполнитель читает файл');
select pg_temp.login('boss');
update public.tasks set description = '![](' || pg_temp.file('boss', 'deleted') || ')' where id = pg_temp.id('task-b');
select pg_temp.login('w2');
select ok(not pg_temp.sees(pg_temp.file('boss', 'removed')), 'файл, убранный из описания, исполнитель не читает');
select ok(pg_temp.sees(pg_temp.file('boss', 'deleted')), 'оставшийся в описании файл читается');
select pg_temp.login('boss');
select public.delete_task(pg_temp.id('task-b'));
select ok(pg_temp.sees(pg_temp.file('boss', 'deleted')), 'постановщик читает файл удалённой задачи');
select pg_temp.login('w2');
select ok(not pg_temp.sees(pg_temp.file('boss', 'deleted')), 'файл из удалённой задачи исполнитель не читает');
select pg_temp.login('boss');
update public.tasks set assignee_id = pg_temp.id('w2') where id = pg_temp.id('task-a');
select pg_temp.login('w1');
select ok(not pg_temp.sees(pg_temp.file('boss', 'linked')), 'снятый с задачи исполнитель файл не читает');
select pg_temp.login('w2');
select ok(pg_temp.sees(pg_temp.file('boss', 'linked')), 'новый исполнитель файл читает');

-- Предел 200 файлов. Файлы другого бакета в счёт не идут.
select pg_temp.logout();
insert into storage.objects (bucket_id, name)
select 'other-bucket', 'fill/' || n || '.png' from generate_series(1, 5) as n;
insert into storage.objects (bucket_id, name)
select 'task-images', 'fill/' || n || '.png'
from generate_series(1, 199 - (select count(*) from storage.objects where bucket_id = 'task-images')) as n;
select pg_temp.login('boss');
select lives_ok(pg_temp.put(pg_temp.file('boss', 'file-200')), 'при 199 файлах вставка проходит');
select throws_ok(pg_temp.put(pg_temp.file('boss', 'file-201')), '42501', :'rls', 'при 200 файлах вставка отказана');
select pg_temp.logout();
select is((select count(*)::int from storage.objects where bucket_id = 'task-images'), 200, 'в бакете ровно 200 файлов');

select * from finish();
rollback;
