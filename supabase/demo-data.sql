-- Демо-данные: 3 объекта, 9 задач, история. Одна команда, поэтому всё загружается целиком или никак.
-- Локально выполняется при db reset после seed.sql. На удалённой базе: сначала scripts/seed-users.mjs, потом этот файл от роли postgres.
-- Повторный запуск ничего не меняет.

do $$
declare
  anna uuid := (select u.id from auth.users u join public.profiles p on p.id = u.id where u.email = 'anna@stroyka.test');
  petr uuid := (select u.id from auth.users u join public.profiles p on p.id = u.id where u.email = 'petr@stroyka.test');
  sergey uuid := (select u.id from auth.users u join public.profiles p on p.id = u.id where u.email = 'sergey@stroyka.test');
begin
  if anna is null or petr is null or sergey is null then
    raise exception 'Нет демо-пользователей: сначала запустите scripts/seed-users.mjs';
  end if;

  if exists (select 1 from public.objects where id = 'a0000000-0000-4000-8000-000000000001') then
    raise notice 'Демо-данные уже загружены';
    return;
  end if;

  -- Триггеры выключены только в этой транзакции: они поставили бы текущего автора, текущее время и статус «Новая».
  set local session_replication_role = replica;
  -- Пояс один на весь файл, меняется этой строкой.
  set local time zone interval '+05:00' hour to minute;

  insert into public.objects (id, name, address, created_by, created_at) values
    ('a0000000-0000-4000-8000-000000000001', 'ЖК Северный', 'ул. Лесная, 14', anna, '2026-10-29 10:00'),
    ('a0000000-0000-4000-8000-000000000002', 'Склад на Южной', 'ул. Южная, 3, строение 2', anna, '2026-10-29 10:10'),
    ('a0000000-0000-4000-8000-000000000003', 'Коттедж Берёзки', 'пос. Берёзки, участок 27', anna, '2026-10-29 10:20');

  insert into public.tasks (id, object_id, title, description, assignee_id, status, author_id, created_at) values
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Залить фундамент секции Б', 'Бетон М300, толщина плиты 400 мм. Перед заливкой сфотографировать арматуру.', petr, 'work', anna, '2026-11-03 09:10'),
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Смонтировать опалубку', 'Опалубка для секции Б по чертежу КЖ-4.', petr, 'review', anna, '2026-11-02 10:00'),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Подвести временное электричество', 'Щит на 63 А у бытовок, кабель в защитной трубе.', null, 'new', anna, '2026-11-04 08:30'),
    ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 'Заменить ворота погрузочной зоны', 'Секционные ворота, проём 3,5 на 4 метра.', petr, 'rework', anna, '2026-11-01 12:15'),
    ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', 'Нанести разметку на пол', 'Жёлтые линии проездов и зоны хранения.', sergey, 'accepted', anna, '2026-10-30 09:00'),
    ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000003', 'Утеплить кровлю', 'Минеральная вата 200 мм, пароизоляция с проклейкой швов.', sergey, 'new', anna, '2026-11-04 09:40'),
    ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000003', 'Установить окна второго этажа', 'Шесть окон, монтаж по ГОСТ, откосы не входят.', sergey, 'work', anna, '2026-11-03 14:20'),
    ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000002', 'Проверить пожарные датчики', 'Все датчики зоны хранения, акт проверки приложить.', sergey, 'review', anna, '2026-11-02 11:30'),
    ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000003', 'Смонтировать водостоки', 'Водосточные трубы по всему периметру кровли.', sergey, 'review', anna, '2026-11-03 10:00');

  -- Порядок вставки по времени: id истории идут в том же порядке, что и даты.
  insert into public.task_events (task_id, kind, actor_id, from_status, to_status, comment, field, old_value, new_value, created_at)
  select
    ('b0000000-0000-4000-8000-00000000000' || e.task)::uuid,
    e.kind::public.task_event_kind, e.actor,
    e.from_status::public.task_status, e.to_status::public.task_status, e.comment,
    e.field::public.task_event_field, e.old_value, e.new_value,
    e.at::timestamptz
  from (
    select
      s.task, case when s.from_status is null then 'created' else 'status' end as kind, s.actor,
      s.from_status, s.to_status, s.comment,
      null as field, null as old_value, null as new_value, s.at
    from (
      values
        (1, anna, null, 'new', null, '2026-11-03 09:10'),
        (1, petr, 'new', 'work', null, '2026-11-03 11:42'),
        (2, anna, null, 'new', null, '2026-11-02 10:00'),
        (2, petr, 'new', 'work', null, '2026-11-02 13:20'),
        (2, petr, 'work', 'review', 'Готово, можно смотреть', '2026-11-04 16:05'),
        (3, anna, null, 'new', null, '2026-11-04 08:30'),
        (4, anna, null, 'new', null, '2026-11-01 12:15'),
        (4, petr, 'new', 'work', null, '2026-11-01 15:00'),
        (4, petr, 'work', 'review', null, '2026-11-03 17:30'),
        (4, anna, 'review', 'rework', 'Ворота перекошены, проверьте направляющие', '2026-11-04 10:12'),
        (5, anna, null, 'new', null, '2026-10-30 09:00'),
        (5, sergey, 'new', 'work', null, '2026-10-30 13:00'),
        (5, sergey, 'work', 'review', null, '2026-10-31 18:10'),
        (5, anna, 'review', 'accepted', 'Линии ровные, принято', '2026-11-01 09:05'),
        (6, anna, null, 'new', null, '2026-11-04 09:40'),
        (7, anna, null, 'new', null, '2026-11-03 14:20'),
        (7, sergey, 'new', 'work', null, '2026-11-03 15:00'),
        (7, sergey, 'work', 'review', null, '2026-11-03 18:00'),
        (7, anna, 'review', 'rework', 'Одно окно продувает, проверьте уплотнитель', '2026-11-04 08:15'),
        (7, sergey, 'rework', 'work', null, '2026-11-04 09:30'),
        (8, anna, null, 'new', null, '2026-11-02 11:30'),
        (8, sergey, 'new', 'work', null, '2026-11-02 14:00'),
        (8, sergey, 'work', 'review', 'Акт приложил', '2026-11-04 12:40'),
        (9, anna, null, 'new', null, '2026-11-03 10:00'),
        (9, sergey, 'new', 'work', null, '2026-11-03 15:10'),
        (9, sergey, 'work', 'review', null, '2026-11-04 17:20')
    ) as s (task, actor, from_status, to_status, comment, at)
    union all
    select 5, 'edit', anna, null, null, null, 'assignee', 'Пётр Иванов', 'Сергей Козлов', '2026-10-30 11:30'
  ) as e
  order by e.at::timestamptz;
end
$$;
