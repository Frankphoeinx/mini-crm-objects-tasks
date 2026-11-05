-- AC-4, AC-5, AC-6, AC-7: кто что читает и пишет под ролью, а не в интерфейсе.
begin;
select plan(97);
\ir fixture.psql

create temp table fixture_tasks as
select pg_temp.id(n) as id from unnest(array['task-a', 'task-b', 'task-self', 'task-free']) as n;
create temp table fixture_objects as
select pg_temp.id(n) as id from unnest(array['obj-a', 'obj-b', 'obj-c']) as n;
grant select on fixture_tasks, fixture_objects to public;

-- Периметр по каталогу: новая таблица или функция не откроется молча.
select is_empty(
  $$ select relname from pg_class
     where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity $$,
  'RLS включён на всех таблицах public'
);
select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'S')
       and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
            or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'usage,select,update'))) $$,
  'у анонима нет прав ни на одну таблицу, вид и последовательность public'
);
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and has_function_privilege('anon', p.oid, 'execute') $$,
  'аноним не вызывает ни одну функцию public и private'
);
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'у анонима нет доступа к схеме private');
select results_eq(
  $$ select p.proname::text collate "default" from pg_proc p
     where p.pronamespace = 'private'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
     order by 1 $$,
  $$ values ('is_manager'), ('my_object_ids') $$,
  'вошедшему из private доступны только хелперы политик'
);
select results_eq(
  $$ select p.proname::text collate "default" from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
     order by 1 $$,
  $$ values ('change_task_status'), ('delete_object'), ('delete_task') $$,
  'вошедшему из public доступны только три функции договорённости'
);
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'у всех security definer задан пустой search_path'
);
select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.task_board'::regclass),
  'task_board работает с security_invoker'
);
select is_empty(
  $$ select unnest(nspacl)::text from pg_namespace where nspname = 'private'
     except
     select unnest(array['postgres=UC/postgres', 'authenticated=U/postgres']) $$,
  'на схему private нет лишних прав'
);

-- Точный список колонок, которые вошедший может писать. Права на колонки держат отдельно от RLS и триггеров.
select results_eq(
  $$ select table_name::text collate "default", privilege_type::text collate "default", column_name::text collate "default"
     from information_schema.column_privileges
     where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE')
     order by 1, 2, 3 $$,
  $$ values
       ('objects', 'INSERT', 'address'), ('objects', 'INSERT', 'name'),
       ('objects', 'UPDATE', 'address'), ('objects', 'UPDATE', 'name'),
       ('tasks', 'INSERT', 'assignee_id'), ('tasks', 'INSERT', 'description'), ('tasks', 'INSERT', 'object_id'), ('tasks', 'INSERT', 'title'),
       ('tasks', 'UPDATE', 'assignee_id'), ('tasks', 'UPDATE', 'description'), ('tasks', 'UPDATE', 'object_id'), ('tasks', 'UPDATE', 'title') $$,
  'вошедший пишет только перечисленные колонки объектов и задач'
);
select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
       and has_table_privilege('authenticated', c.oid, 'delete,truncate,references,trigger') $$,
  'вошедшему не выданы DELETE, TRUNCATE, REFERENCES, TRIGGER'
);

-- Аноним: читать и писать нельзя ничего.
select pg_temp.login_anon();
select throws_ok(q, '42501', null, 'аноним: ' || q)
from unnest(array[
  'select * from public.profiles',
  'select * from public.objects',
  'select * from public.tasks',
  'select * from public.task_events',
  'select * from public.task_board',
  $$ insert into public.objects (name, address) values ('x', 'y') $$,
  $$ insert into public.tasks (object_id, title) values (gen_random_uuid(), 'x') $$,
  $$ update public.tasks set title = 'x' $$,
  $$ delete from public.tasks $$,
  $$ select public.delete_task(gen_random_uuid()) $$,
  $$ select public.delete_object(gen_random_uuid()) $$,
  $$ select public.change_task_status(gen_random_uuid(), 'work') $$,
  $$ select private.is_manager() $$
]) as q;

-- Постановщик видит все объекты и задачи.
select pg_temp.login('boss');
select is((select count(*)::int from public.objects where id in (select id from fixture_objects)), 3, 'постановщик видит все объекты');
select is((select count(*)::int from public.tasks where id in (select id from fixture_tasks)), 4, 'постановщик видит все задачи, в том числе без исполнителя');
select is((select count(*)::int from public.task_events where task_id in (select id from fixture_tasks)), 4, 'постановщик видит историю всех задач');
select is((select count(*)::int from public.task_board where id in (select id from fixture_tasks)), 4, 'постановщик видит все задачи в task_board');

-- Исполнитель видит только своё.
select pg_temp.login('w1');
select results_eq(
  $$ select id from public.tasks where id in (select id from fixture_tasks) $$,
  $$ values (pg_temp.id('task-a')) $$, 'исполнитель видит только свою задачу'
);
select results_eq(
  $$ select id from public.objects where id in (select id from fixture_objects) $$,
  $$ values (pg_temp.id('obj-a')) $$, 'исполнитель видит только объект со своей задачей'
);
select results_eq(
  $$ select task_id from public.task_events where task_id in (select id from fixture_tasks) $$,
  $$ values (pg_temp.id('task-a')) $$, 'исполнитель видит историю только своей задачи'
);
select results_eq(
  $$ select id from public.task_board where id in (select id from fixture_tasks) $$,
  $$ values (pg_temp.id('task-a')) $$, 'исполнитель видит в task_board только свою задачу'
);
select is_empty($$ select 1 from public.tasks where id = pg_temp.id('task-b') $$, 'чужая задача по id не читается');
select is_empty($$ select 1 from public.objects where id = pg_temp.id('obj-b') $$, 'чужой объект по id не читается');
select is_empty($$ select 1 from public.task_events where task_id = pg_temp.id('task-b') $$, 'чужая история по id не читается');
select is_empty($$ select 1 from public.task_board where object_id = pg_temp.id('obj-b') $$, 'чужой объект через task_board не читается');
select is((select count(*)::int from public.profiles where id = pg_temp.id('boss')), 1, 'исполнитель читает имена в profiles');

-- Роль только из profiles: метаданные токена ничего не добавляют.
select pg_temp.login('w1', '{"user_metadata": {"role": "manager"}, "app_metadata": {"role": "manager"}}');
select is((select count(*)::int from public.tasks where id in (select id from fixture_tasks)), 1, 'метаданные токена не расширяют чтение');
select throws_ok(
  $$ insert into public.objects (name, address) values ('x', 'y') $$,
  '42501', 'Это действие доступно постановщику', 'метаданные токена не дают создать объект'
);

-- Исполнитель не пишет: чужое и своё даёт 0 строк, вставка и удаление запрещены.
select pg_temp.login('w1');
select is(pg_temp.affected($$ update public.tasks set title = 'взлом' where id = pg_temp.id('task-a') $$), 0, 'исполнитель не правит свою задачу');
select is(pg_temp.affected($$ update public.tasks set title = 'взлом' where id = pg_temp.id('task-b') $$), 0, 'исполнитель не правит чужую задачу');
select is(pg_temp.affected($$ update public.tasks set assignee_id = pg_temp.id('w1') where id = pg_temp.id('task-free') $$), 0, 'исполнитель не назначает себя на свободную задачу');
select is(pg_temp.affected($$ update public.objects set name = 'взлом' where id = pg_temp.id('obj-a') $$), 0, 'исполнитель не правит свой объект');
select is(pg_temp.affected($$ update public.objects set name = 'взлом' where id = pg_temp.id('obj-b') $$), 0, 'исполнитель не правит чужой объект');
select throws_ok(
  $$ insert into public.tasks (object_id, title) values (pg_temp.id('obj-a'), 'x') $$,
  '42501', 'Это действие доступно постановщику', 'исполнитель не создаёт задачу'
);
select throws_ok(
  $$ insert into public.objects (name, address) values ('x', 'y') $$,
  '42501', 'Это действие доступно постановщику', 'исполнитель не создаёт объект'
);
select throws_ok(q, '42501', null, 'исполнитель: ' || q)
from unnest(array[
  $$ delete from public.tasks where id = pg_temp.id('task-a') $$,
  $$ delete from public.objects where id = pg_temp.id('obj-a') $$,
  $$ select public.delete_task(pg_temp.id('task-a')) $$,
  $$ select public.delete_object(pg_temp.id('obj-a')) $$,
  $$ update public.profiles set role = 'manager' where id = pg_temp.id('w1') $$,
  $$ update public.profiles set full_name = 'x' where id = pg_temp.id('w1') $$,
  $$ insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'x', 'manager') $$,
  $$ delete from public.profiles where id = pg_temp.id('w1') $$,
  $$ select private.clean_text('x', 'x', 1) $$
]) as q;

select pg_temp.logout();
select is(
  (select title from public.tasks where id = pg_temp.id('task-a')) || (select title from public.tasks where id = pg_temp.id('task-b')),
  'Задача АЗадача Б', 'данные задач не изменились'
);
select is((select name from public.objects where id = pg_temp.id('obj-a')), 'Объект А', 'данные объекта не изменились');
select is((select role from public.profiles where id = pg_temp.id('w1')), 'worker'::public.user_role, 'роль не изменилась');

-- Пользователь без профиля не видит задач и объектов и не пишет.
select pg_temp.login('ghost');
select is_empty($$ select 1 from public.tasks where id in (select id from fixture_tasks) $$, 'без профиля задач нет');
select is_empty($$ select 1 from public.objects where id in (select id from fixture_objects) $$, 'без профиля объектов нет');
select throws_ok(
  $$ insert into public.objects (name, address) values ('x', 'y') $$,
  '42501', 'Это действие доступно постановщику', 'без профиля объект не создать'
);

-- Прямая запись защищённых колонок запрещена даже постановщику: статус меняется только функцией.
select pg_temp.login('boss');
select throws_ok(q, '42501', null, 'постановщик: ' || q)
from unnest(array[
  $$ update public.tasks set status = 'accepted' where id = pg_temp.id('task-a') $$,
  $$ update public.tasks set deleted_at = now() where id = pg_temp.id('task-a') $$,
  $$ update public.tasks set author_id = pg_temp.id('w1') where id = pg_temp.id('task-a') $$,
  $$ update public.tasks set created_at = now() - interval '1 year' where id = pg_temp.id('task-a') $$,
  $$ update public.tasks set id = gen_random_uuid() where id = pg_temp.id('task-a') $$,
  $$ insert into public.tasks (object_id, title, status) values (pg_temp.id('obj-a'), 'x', 'accepted') $$,
  $$ insert into public.tasks (object_id, title, author_id) values (pg_temp.id('obj-a'), 'x', pg_temp.id('w1')) $$,
  $$ insert into public.tasks (object_id, title, created_at) values (pg_temp.id('obj-a'), 'x', now() - interval '1 year') $$,
  $$ insert into public.tasks (object_id, title, deleted_at) values (pg_temp.id('obj-a'), 'x', now()) $$,
  $$ insert into public.tasks (id, object_id, title) values (gen_random_uuid(), pg_temp.id('obj-a'), 'x') $$,
  $$ update public.objects set deleted_at = now() where id = pg_temp.id('obj-a') $$,
  $$ update public.objects set created_by = pg_temp.id('w1') where id = pg_temp.id('obj-a') $$,
  $$ update public.objects set created_at = now() where id = pg_temp.id('obj-a') $$,
  $$ insert into public.objects (name, address, created_by) values ('x', 'y', pg_temp.id('w1')) $$,
  $$ insert into public.objects (name, address, created_at) values ('x', 'y', now() - interval '1 year') $$,
  $$ insert into public.objects (name, address, deleted_at) values ('x', 'y', now()) $$,
  $$ delete from public.tasks where id = pg_temp.id('task-a') $$,
  $$ delete from public.objects where id = pg_temp.id('obj-a') $$,
  $$ truncate public.objects cascade $$,
  $$ update public.profiles set role = 'worker' where id = pg_temp.id('boss') $$
]) as q;

select throws_ok(
  $$ update public.task_board set status = 'accepted' where id = pg_temp.id('task-a') $$,
  '55000', null, 'через task_board записать нельзя'
);

select pg_temp.logout();
select results_eq(
  $$ select status::text, author_id, deleted_at from public.tasks where id = pg_temp.id('task-a') $$,
  $$ values ('work', pg_temp.id('boss'), null::timestamptz) $$,
  'после попыток статус, автор и удаление на месте'
);

-- Секретный ключ не меняет статус и не пишет задачи и объекты: это только чтение и профили.
select pg_temp.login_service();
select throws_ok(q, '42501', null, 'секретный ключ: ' || q)
from unnest(array[
  $$ update public.tasks set status = 'accepted' where id = pg_temp.id('task-a') $$,
  $$ insert into public.tasks (object_id, title) values (pg_temp.id('obj-a'), 'x') $$,
  $$ delete from public.tasks where id = pg_temp.id('task-a') $$,
  $$ update public.objects set name = 'x' where id = pg_temp.id('obj-a') $$,
  $$ select public.change_task_status(pg_temp.id('task-a'), 'review') $$
]) as q;

select lives_ok(
  $$ insert into public.profiles (id, full_name, role) values (pg_temp.id('ghost'), 'Был без профиля', 'worker')
     on conflict (id) do update set full_name = excluded.full_name, role = excluded.role $$,
  'секретный ключ пишет профили: это нужно scripts/seed-users.mjs'
);

-- Видимость объекта идёт за задачей: переназначили, и объект у прежнего исполнителя пропал, у нового появился.
select pg_temp.login('boss');
update public.tasks set assignee_id = pg_temp.id('w2') where id = pg_temp.id('task-a');
select pg_temp.login('w1');
select is_empty($$ select 1 from public.objects where id = pg_temp.id('obj-a') $$, 'после переназначения прежний исполнитель не видит объект');
select is_empty($$ select 1 from public.task_events where task_id = pg_temp.id('task-a') $$, 'и историю задачи');
select pg_temp.login('w2');
select is((select count(*)::int from public.objects where id = pg_temp.id('obj-a')), 1, 'новый исполнитель видит объект');
select is((select count(*)::int from public.task_events where task_id = pg_temp.id('task-a') and kind = 'created'), 1, 'и всю историю задачи');

-- task_board: поля возврата считаются по истории и видны только тем, кто видит задачу.
select pg_temp.logout();
update public.tasks set status = 'review' where id = pg_temp.id('task-b');
select pg_temp.login('boss');
select public.change_task_status(pg_temp.id('task-b'), 'rework', 'Первая причина');
select pg_temp.logout();
update public.tasks set status = 'review' where id = pg_temp.id('task-b');
select pg_temp.login('boss2');
select public.change_task_status(pg_temp.id('task-b'), 'rework', 'Вторая причина');

select results_eq(
  $$ select status::text, return_count, last_return_comment, last_return_by, last_return_at from public.task_board where id = pg_temp.id('task-b') $$,
  $$ values ('rework', 2, 'Вторая причина', pg_temp.id('boss2'), now()) $$,
  'постановщик видит счётчик и последнюю причину возврата'
);
select results_eq(
  $$ select return_count, last_return_comment, last_return_by, last_return_at from public.task_board where id = pg_temp.id('task-free') $$,
  $$ values (0, null::text, null::uuid, null::timestamptz) $$,
  'без возвратов поля пустые, счётчик ноль'
);
select pg_temp.login('w2');
select is((select last_return_comment from public.task_board where id = pg_temp.id('task-b')), 'Вторая причина', 'исполнитель видит причину возврата своей задачи');
select pg_temp.login('w1');
select is_empty($$ select 1 from public.task_board where id = pg_temp.id('task-b') $$, 'чужой исполнитель не видит задачу с возвратом в task_board');

select * from finish();
rollback;
