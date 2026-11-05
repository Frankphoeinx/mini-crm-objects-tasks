-- Демо-данные. Файл читает то, что загрузил db reset.
begin;
select plan(13);

-- Пользователей находим заранее: под ролью authenticated auth.users недоступна.
create temp table demo_users as select id, email from auth.users;
grant select on demo_users to public;

create function pg_temp.login_email(p_email text) returns void
language sql as $$
  select
    set_config('role', 'authenticated', true),
    set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', (select id from demo_users where email = p_email), 'role', 'authenticated')::text,
      true
    )
$$;

select results_eq(
  $$ select u.email::text, p.full_name, p.role::text from public.profiles p join auth.users u on u.id = p.id order by u.email $$,
  $$ values
       ('anna@stroyka.test', 'Анна Смирнова', 'manager'),
       ('petr@stroyka.test', 'Пётр Иванов', 'worker'),
       ('sergey@stroyka.test', 'Сергей Козлов', 'worker') $$,
  'три демо-пользователя и их роли'
);
select is_empty(
  $$ select 1 from auth.users where email like '%@stroyka.test' and coalesce(encrypted_password, '') <> '' $$,
  'в локальном seed нет паролей'
);
select is(
  (select array_agg(name order by name) from public.objects),
  array['ЖК Северный', 'Коттедж Берёзки', 'Склад на Южной'], 'три объекта'
);
select results_eq(
  $$ select status::text, count(*)::int from public.tasks group by 1 order by 1 $$,
  $$ values ('accepted', 1), ('new', 2), ('review', 3), ('rework', 1), ('work', 2) $$,
  'девять задач во всех статусах'
);
select is((select count(*)::int from public.tasks where assignee_id is null), 1, 'одна задача без исполнителя');
select is((select count(*)::int from public.task_events), 27, 'все 27 записей истории');
select is(
  (select to_char(min(created_at) at time zone interval '+05:00', 'YYYY-MM-DD HH24:MI') from public.task_events),
  '2026-10-30 09:00', 'первая запись истории'
);
select results_eq(
  $$ select old_value, new_value from public.task_events where kind = 'edit' $$,
  $$ values ('Пётр Иванов', 'Сергей Козлов') $$,
  'правка исполнителя с именами'
);

-- История правдоподобна: цепочка статусов без разрывов приводит к текущему статусу задачи.
select is_empty(
  $$ with chain as (
       select task_id, id, from_status, to_status,
              lag(to_status) over (partition by task_id order by created_at, id) as previous
       from public.task_events
       where kind in ('created', 'status')
     )
     select task_id from chain where from_status is distinct from previous
     union all
     select t.id from public.tasks t
     where t.status <> (select c.to_status from chain c where c.task_id = t.id order by c.id desc limit 1) $$,
  'цепочка статусов каждой задачи непрерывна и заканчивается текущим статусом'
);
select is_empty(
  $$ select 1 from public.task_events e join public.tasks t on t.id = e.task_id
     where e.kind = 'created' and (e.created_at <> t.created_at or e.actor_id <> t.author_id) $$,
  'дата и автор задачи совпадают с записью о создании'
);

-- Задача второго круга и видимость на демо-пользователях.
select pg_temp.login_email('anna@stroyka.test');
select results_eq(
  $$ select title, status::text, return_count, last_return_comment from public.task_board where return_count > 0 order by title $$,
  $$ values
       ('Заменить ворота погрузочной зоны', 'rework', 1, 'Ворота перекошены, проверьте направляющие'),
       ('Установить окна второго этажа', 'work', 1, 'Одно окно продувает, проверьте уплотнитель') $$,
  'две задачи второго круга с причиной возврата'
);
select pg_temp.login_email('petr@stroyka.test');
select results_eq(
  $$ select (select count(*)::int from public.tasks), (select count(*)::int from public.objects) $$,
  $$ values (3, 2) $$,
  'Пётр видит три задачи и два объекта'
);
select pg_temp.login_email('sergey@stroyka.test');
select results_eq(
  $$ select (select count(*)::int from public.tasks), (select count(*)::int from public.objects) $$,
  $$ values (5, 2) $$,
  'Сергей видит пять задач и два объекта'
);

select * from finish();
rollback;
