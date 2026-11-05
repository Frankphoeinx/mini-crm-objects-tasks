-- ТЗ 2.1: исполнитель видит только объекты, где у него есть задачи. История не должна выдавать имя чужого объекта.
begin;
select plan(4);
\ir fixture.psql

select pg_temp.login('boss');
update public.tasks set object_id = pg_temp.id('obj-b') where id = pg_temp.id('task-a');
update public.tasks set title = 'Задача А, правка' where id = pg_temp.id('task-a');
select is(
  (select count(*)::int from public.task_events where task_id = pg_temp.id('task-a') and field = 'object'),
  1,
  'постановщик видит запись о смене объекта'
);
select pg_temp.logout();

select pg_temp.login('w1');
select is(
  (select count(*)::int from public.task_events where task_id = pg_temp.id('task-a') and field = 'object'),
  0,
  'исполнитель не видит запись с именем прежнего объекта'
);
select is(
  (select count(*)::int from public.task_events where task_id = pg_temp.id('task-a') and field = 'title'),
  1,
  'другие правки своей задачи исполнитель видит'
);
select is(
  (select count(*)::int from public.task_events where task_id = pg_temp.id('task-a') and kind = 'created'),
  1,
  'историю статусов своей задачи исполнитель видит'
);
select pg_temp.logout();

select * from finish();
rollback;
