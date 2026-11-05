-- Номер версии текста: растёт от правки текста, клиенту недоступен, устаревшая правка не проходит.
begin;
select plan(8);
\ir fixture.psql

select pg_temp.login('boss');
select is((select text_version from public.tasks where id = pg_temp.id('task-a')), 0, 'новая задача с версией 0');

update public.tasks set title = 'Новое название' where id = pg_temp.id('task-a');
select is((select text_version from public.tasks where id = pg_temp.id('task-a')), 1, 'правка названия повышает версию');

update public.tasks set description = 'Новое описание' where id = pg_temp.id('task-a');
select is((select text_version from public.task_board where id = pg_temp.id('task-a')), 2, 'правка описания повышает версию, вид её отдаёт');

update public.tasks set assignee_id = pg_temp.id('w2') where id = pg_temp.id('task-a');
select is((select text_version from public.tasks where id = pg_temp.id('task-a')), 2, 'смена исполнителя версию не трогает');

select is(
  pg_temp.affected($$update public.tasks set description = 'Устаревшая правка' where id = pg_temp.id('task-a') and text_version = 1$$),
  0,
  'правка по устаревшей версии не задевает ни одной строки'
);
select is((select description from public.tasks where id = pg_temp.id('task-a')), 'Новое описание', 'текст другого постановщика цел');

select throws_ok(
  $$update public.tasks set text_version = 99 where id = pg_temp.id('task-a')$$,
  '42501', null, 'напрямую версию не записать'
);
select pg_temp.logout();

select pg_temp.login('w2');
select lives_ok(
  $$select public.change_task_status(pg_temp.id('task-b'), 'review')$$,
  'смена статуса работает как раньше'
);
select pg_temp.logout();

select * from finish();
rollback;
