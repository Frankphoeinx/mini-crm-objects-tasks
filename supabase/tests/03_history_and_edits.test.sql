-- AC-3, AC-5, AC-15: создание, журнал правок, снятие исполнителя, неизменность истории, удаление.
begin;
select plan(90);
\ir fixture.psql

-- Создание: статус, автор и время ставит база.
select pg_temp.login('boss');
insert into public.tasks (object_id, title, description, assignee_id)
values (pg_temp.id('obj-a'), '  Новая задача  ', 'Описание', pg_temp.id('w1'));
select results_eq(
  $$ select title, status::text, author_id, created_at, deleted_at from public.tasks where title = 'Новая задача' $$,
  $$ values ('Новая задача', 'new', pg_temp.id('boss'), now(), null::timestamptz) $$,
  'новая задача: статус new, автор из входа, время базы, название без крайних пробелов'
);
select results_eq(
  $$ select e.kind::text, e.actor_id, e.from_status::text, e.to_status::text, e.created_at
     from public.task_events e join public.tasks t on t.id = e.task_id where t.title = 'Новая задача' $$,
  $$ values ('created', pg_temp.id('boss'), null::text, 'new', now()) $$,
  'создание записано в историю'
);
insert into public.objects (name, address) values ('Новый объект', 'Новый адрес');
select results_eq(
  $$ select created_by, created_at from public.objects where name = 'Новый объект' $$,
  $$ values (pg_temp.id('boss'), now()) $$,
  'новый объект: автор и время от базы'
);
insert into public.tasks (object_id, title) values (pg_temp.id('obj-a'), 'Без описания и исполнителя');
select results_eq(
  $$ select description, assignee_id from public.tasks where title = 'Без описания и исполнителя' $$,
  $$ values ('', null::uuid) $$,
  'исполнителя можно назначить позже, описание необязательно'
);

-- Второй слой: триггер перезаписывает значения, даже если вставляет владелец таблицы мимо прав на колонки.
select pg_temp.logout();
select set_config('request.jwt.claims', format('{"sub": "%s"}', pg_temp.id('boss2')), true);
insert into public.tasks (object_id, title, assignee_id, status, author_id, created_at, deleted_at)
values (pg_temp.id('obj-a'), 'Подделка', pg_temp.id('w1'), 'accepted', pg_temp.id('w1'), now() - interval '1 year', now());
select results_eq(
  $$ select status::text, author_id, created_at, deleted_at from public.tasks where title = 'Подделка' $$,
  $$ values ('new', pg_temp.id('boss2'), now(), null::timestamptz) $$,
  'триггер не даёт подделать статус, автора, время и удаление задачи'
);
insert into public.objects (name, address, created_by, created_at, deleted_at)
values ('Подделка', 'Адрес', pg_temp.id('w1'), now() - interval '1 year', now());
select results_eq(
  $$ select created_by, created_at, deleted_at from public.objects where name = 'Подделка' $$,
  $$ values (pg_temp.id('boss2'), now(), null::timestamptz) $$,
  'триггер не даёт подделать автора, время и удаление объекта'
);
select pg_temp.logout();
select throws_ok(
  $$ insert into public.tasks (object_id, title) values (pg_temp.id('obj-a'), 'Без входа') $$,
  '42501', 'Это действие доступно постановщику', 'без входа задачу не создать даже владельцу'
);

-- Журнал правок: понятные старое и новое значения.
select pg_temp.login('boss2');
update public.tasks set title = 'Задача А2' where id = pg_temp.id('task-a');
select results_eq(
  $$ select kind::text, actor_id, field::text, old_value, new_value, created_at from public.task_events
     where task_id = pg_temp.id('task-a') and field = 'title' $$,
  $$ values ('edit', pg_temp.id('boss2'), 'title', 'Задача А', 'Задача А2', now()) $$,
  'правка названия: кто, когда, что было, что стало'
);
update public.tasks set description = 'Новое описание' where id = pg_temp.id('task-a');
select results_eq(
  $$ select old_value, new_value from public.task_events where task_id = pg_temp.id('task-a') and field = 'description' $$,
  $$ values ('', 'Новое описание') $$,
  'правка описания'
);
update public.tasks set object_id = pg_temp.id('obj-a') where id = pg_temp.id('task-self');
select results_eq(
  $$ select old_value, new_value from public.task_events where task_id = pg_temp.id('task-self') and field = 'object' $$,
  $$ values ('Объект В', 'Объект А') $$,
  'правка объекта: имена, а не uuid'
);
update public.tasks set assignee_id = pg_temp.id('w2') where id = pg_temp.id('task-self');
select results_eq(
  $$ select old_value, new_value from public.task_events where task_id = pg_temp.id('task-self') and field = 'assignee' $$,
  $$ values ('Босс Первый', 'Рабочий Второй') $$,
  'правка исполнителя: имена, а не uuid'
);
update public.tasks set assignee_id = pg_temp.id('w1') where id = pg_temp.id('task-free');
select results_eq(
  $$ select old_value, new_value from public.task_events where task_id = pg_temp.id('task-free') and field = 'assignee' $$,
  $$ values ('Не назначен', 'Рабочий Первый') $$,
  'назначение на задачу без исполнителя'
);
update public.tasks set assignee_id = null where id = pg_temp.id('task-free');
select results_eq(
  $$ select old_value, new_value from public.task_events where task_id = pg_temp.id('task-free') and field = 'assignee' order by id desc limit 1 $$,
  $$ values ('Рабочий Первый', 'Не назначен') $$,
  'снятие исполнителя у новой задачи разрешено и записано'
);
select is((select status from public.tasks where id = pg_temp.id('task-free')), 'new'::public.task_status, 'снятие не меняет статус');

select is(
  pg_temp.affected($$ update public.tasks set title = 'Задача А2', description = 'Новое описание' where id = pg_temp.id('task-a') $$),
  1, 'правка теми же значениями проходит'
);
select is((select count(*)::int from public.task_events where task_id = pg_temp.id('task-a') and kind = 'edit'), 2, 'правка без изменений не пишет событий');

update public.tasks set title = 'Две правки', description = 'Сразу' where id = pg_temp.id('task-b');
select is((select count(*)::int from public.task_events where task_id = pg_temp.id('task-b') and kind = 'edit'), 2, 'две правки одной командой дают два события');

select is(
  (select status from public.tasks where id = pg_temp.id('task-a')), 'work'::public.task_status,
  'правка не меняет статус'
);

-- Пустое и длинное: понятный текст до CHECK.
select throws_ok(q, '23514', m, q)
from (values
  ($$ update public.tasks set title = '   ' where id = pg_temp.id('task-a') $$, 'Название не может быть пустым.'),
  ($$ update public.tasks set title = repeat('я', 201) where id = pg_temp.id('task-a') $$, 'Название: не больше 200 знаков.'),
  ($$ update public.tasks set description = repeat('я', 5001) where id = pg_temp.id('task-a') $$, 'Описание: не больше 5000 знаков.'),
  ($$ insert into public.tasks (object_id, title) values (pg_temp.id('obj-a'), '') $$, 'Название не может быть пустым.'),
  ($$ update public.objects set name = ' ' where id = pg_temp.id('obj-a') $$, 'Название не может быть пустым.'),
  ($$ update public.objects set address = '' where id = pg_temp.id('obj-a') $$, 'Адрес не может быть пустым.'),
  ($$ insert into public.objects (name, address) values ('', 'y') $$, 'Название не может быть пустым.'),
  ($$ insert into public.objects (name, address) values (repeat('я', 201), 'y') $$, 'Название: не больше 200 знаков.'),
  ($$ insert into public.objects (name, address) values ('x', repeat('я', 301)) $$, 'Адрес: не больше 300 знаков.')
) as v (q, m);

-- Правка объекта постановщиком.
select is(pg_temp.affected($$ update public.objects set name = ' Объект В2 ', address = 'Адрес В2' where id = pg_temp.id('obj-c') $$), 1, 'постановщик правит объект');
select is((select name from public.objects where id = pg_temp.id('obj-c')), 'Объект В2', 'название объекта без крайних пробелов');

-- Снять исполнителя можно только у новой задачи.
create function pg_temp.unassign_refused()
returns setof text
language plpgsql as $$
declare
  v_status public.task_status;
begin
  foreach v_status in array array['work', 'review', 'rework', 'accepted']::public.task_status[] loop
    perform pg_temp.logout();
    update public.tasks set status = v_status where id = pg_temp.id('task-a');
    perform pg_temp.login('boss');
    return next throws_ok(
      $q$ update public.tasks set assignee_id = null where id = pg_temp.id('task-a') $q$,
      '23514', 'Снять исполнителя можно только у новой задачи.', 'снять исполнителя у ' || v_status
    );
  end loop;
end
$$;
select * from pg_temp.unassign_refused();

-- CHECK держит правило сам, без триггера.
select pg_temp.logout();
set local session_replication_role = replica;
select throws_ok(
  $$ update public.tasks set assignee_id = null where id = pg_temp.id('task-a') $$,
  '23514', null, 'CHECK на исполнителя держит и при выключенных триггерах'
);
select throws_ok(
  $$ insert into public.tasks (object_id, title, status, author_id) values (pg_temp.id('obj-a'), 'x', 'work', pg_temp.id('boss')) $$,
  '23514', null, 'CHECK: задача в работе без исполнителя не вставляется'
);
set local session_replication_role = origin;
update public.tasks set status = 'work' where id = pg_temp.id('task-a');

-- Неизменность истории: клиент, секретный ключ, владелец.
create temp table events_before as select * from public.task_events;
grant select on events_before to public;

select pg_temp.login('boss');
select throws_ok(q, '42501', null, 'постановщик: ' || q)
from unnest(array[
  $$ update public.task_events set comment = 'подделка' $$,
  $$ update public.task_events set created_at = now() - interval '1 year', actor_id = pg_temp.id('w1') $$,
  $$ delete from public.task_events $$,
  $$ truncate public.task_events $$,
  $$ insert into public.task_events (task_id, kind, actor_id) values (pg_temp.id('task-a'), 'deleted', pg_temp.id('boss')) $$
]) as q;

select pg_temp.login('w1');
select throws_ok(q, '42501', null, 'исполнитель: ' || q)
from unnest(array[
  $$ update public.task_events set comment = 'подделка' where task_id = pg_temp.id('task-a') $$,
  $$ delete from public.task_events where task_id = pg_temp.id('task-a') $$,
  $$ insert into public.task_events (task_id, kind, actor_id, from_status, to_status) values (pg_temp.id('task-a'), 'status', pg_temp.id('boss'), 'review', 'accepted') $$
]) as q;

select pg_temp.login_service();
select throws_ok(q, '42501', null, 'секретный ключ: ' || q)
from unnest(array[
  $$ update public.task_events set comment = 'подделка' $$,
  $$ delete from public.task_events $$,
  $$ truncate public.task_events $$,
  $$ insert into public.task_events (task_id, kind, actor_id) values (pg_temp.id('task-a'), 'deleted', pg_temp.id('boss')) $$,
  $$ set local session_replication_role = replica $$
]) as q;

-- Если права выдадут по ошибке, остаётся триггер: проверяем его отдельно от прав.
select pg_temp.logout();
grant update, delete, truncate on public.task_events to service_role;
select pg_temp.login_service();
select throws_ok(q, '42501', 'Историю нельзя изменить или удалить.', 'триггер, секретный ключ с правами: ' || q)
from unnest(array[
  $$ update public.task_events set comment = 'подделка' $$,
  $$ delete from public.task_events $$,
  $$ truncate public.task_events $$
]) as q;
select pg_temp.logout();
revoke update, delete, truncate on public.task_events from service_role;

select throws_ok(q, '42501', 'Историю нельзя изменить или удалить.', 'триггер, владелец: ' || q)
from unnest(array[
  $$ update public.task_events set comment = 'подделка' $$,
  $$ update public.task_events set comment = 'ни одной строки' where false $$,
  $$ delete from public.task_events $$,
  $$ truncate public.task_events $$,
  $$ truncate public.tasks, public.task_events $$,
  $$ truncate public.tasks cascade $$
]) as q;
select throws_ok(
  $$ delete from public.tasks where id = pg_temp.id('task-a') $$,
  '23503', null, 'задачу с историей нельзя стереть: история не исчезнет каскадом'
);
select throws_ok(
  $$ delete from public.profiles where id = pg_temp.id('boss') $$,
  '23503', null, 'автора истории нельзя стереть'
);
select throws_ok(
  $$ delete from auth.users where id = pg_temp.id('boss') $$,
  '23503', null, 'пользователя с историей нельзя стереть из auth.users'
);

select is_empty(
  $$ (select id, comment, actor_id, created_at from public.task_events except select id, comment, actor_id, created_at from events_before)
     union all
     (select id, comment, actor_id, created_at from events_before except select id, comment, actor_id, created_at from public.task_events) $$,
  'история не изменилась после всех попыток'
);

-- Правка удалённого и перенос в удалённое. Удаляем под постановщиком.
select pg_temp.login('boss');
select lives_ok($$ select public.delete_task(pg_temp.id('task-b')) $$, 'постановщик удаляет задачу');

select is_empty($$ select 1 from public.task_events where task_id = pg_temp.id('task-b') $$, 'постановщик не видит историю удалённой задачи');
select is_empty($$ select 1 from public.tasks where id = pg_temp.id('task-b') $$, 'удалённую задачу не видит постановщик');
select is_empty($$ select 1 from public.task_board where id = pg_temp.id('task-b') $$, 'и в task_board её нет');
select is(pg_temp.affected($$ update public.tasks set title = 'После удаления' where id = pg_temp.id('task-b') $$), 0, 'постановщик не правит удалённую задачу');
select throws_ok(
  $$ select public.delete_task(pg_temp.id('task-b')) $$,
  'P0002', 'Задача не найдена', 'повторное удаление задачи'
);
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-b'), 'review') $$,
  'P0002', 'Задача не найдена', 'смена статуса удалённой задачи'
);

select pg_temp.login('w2');
select is_empty($$ select 1 from public.tasks where id = pg_temp.id('task-b') $$, 'удалённую задачу не видит исполнитель');
select is_empty($$ select 1 from public.task_events where task_id = pg_temp.id('task-b') $$, 'и её историю');
select is_empty($$ select 1 from public.objects where id = pg_temp.id('obj-b') $$, 'объект без неудалённых задач исполнитель больше не видит');
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-b'), 'review') $$,
  'P0002', 'Задача не найдена', 'исполнитель не меняет статус удалённой задачи'
);

select pg_temp.logout();
select is((select title from public.tasks where id = pg_temp.id('task-b')), 'Две правки', 'удалённая запись осталась в базе без изменений');
select results_eq(
  $$ select actor_id, from_status, to_status, field::text from public.task_events where task_id = pg_temp.id('task-b') and kind = 'deleted' $$,
  $$ values (pg_temp.id('boss'), null::public.task_status, null::public.task_status, null::text) $$,
  'удаление записано в историю'
);
select throws_ok(
  $$ update public.tasks set title = 'Владелец' where id = pg_temp.id('task-b') $$,
  'P0002', 'Задача не найдена', 'триггер запрещает правку удалённой задачи даже владельцу'
);

-- Удаление объекта: скрывает задачи, событие только у неудалённых.
select pg_temp.login('boss');
insert into public.tasks (object_id, title, assignee_id) values (pg_temp.id('obj-b'), 'Вторая на Б', pg_temp.id('w2'));
select lives_ok($$ select public.delete_object(pg_temp.id('obj-b')) $$, 'постановщик удаляет объект');
select is_empty($$ select 1 from public.objects where id = pg_temp.id('obj-b') $$, 'удалённый объект не видит постановщик');
select is_empty($$ select 1 from public.tasks where object_id = pg_temp.id('obj-b') $$, 'задачи объекта скрылись');
select throws_ok(
  $$ select public.delete_object(pg_temp.id('obj-b')) $$,
  'P0002', 'Объект не найден', 'повторное удаление объекта'
);
select throws_ok(
  $$ select public.delete_object(gen_random_uuid()) $$,
  'P0002', 'Объект не найден', 'несуществующий объект'
);
select throws_ok(
  $$ select public.delete_task(gen_random_uuid()) $$,
  'P0002', 'Задача не найдена', 'несуществующая задача'
);
select throws_ok(
  $$ insert into public.tasks (object_id, title) values (pg_temp.id('obj-b'), 'В удалённый') $$,
  'P0002', 'Объект не найден', 'задачу нельзя создать в удалённом объекте'
);
select throws_ok(
  $$ update public.tasks set object_id = pg_temp.id('obj-b') where id = pg_temp.id('task-self') $$,
  'P0002', 'Объект не найден', 'задачу нельзя перенести в удалённый объект'
);
select is(pg_temp.affected($$ update public.objects set name = 'После удаления' where id = pg_temp.id('obj-b') $$), 0, 'постановщик не правит удалённый объект');
select lives_ok($$ update public.tasks set description = 'Всем' $$, 'правка без условия обходит удалённые задачи');
select lives_ok($$ update public.objects set address = 'Всем' $$, 'правка без условия обходит удалённые объекты');

select pg_temp.logout();
select is(
  (select count(*)::int from public.task_events where task_id = pg_temp.id('task-b') and kind = 'deleted'), 1,
  'у задачи, удалённой раньше, второго события нет'
);
select results_eq(
  $$ select e.actor_id, t.deleted_at is not null from public.task_events e join public.tasks t on t.id = e.task_id
     where t.title = 'Вторая на Б' and e.kind = 'deleted' $$,
  $$ values (pg_temp.id('boss'), true) $$,
  'у неудалённой задачи объекта появилось событие deleted'
);
select ok((select deleted_at is not null from public.objects where id = pg_temp.id('obj-b')), 'удалённый объект остался в базе');
select throws_ok(
  $$ update public.objects set name = 'Владелец' where id = pg_temp.id('obj-b') $$,
  'P0002', 'Объект не найден', 'триггер запрещает правку удалённого объекта даже владельцу'
);

select * from finish();
rollback;
