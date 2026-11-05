-- AC-2, AC-3, AC-6: матрица переходов и смена статуса.
begin;
select plan(151);
\ir fixture.psql

-- Пробует переход и возвращает 'ok' или код ошибки. Откат подтранзакции возвращает и роль, и данные.
create function pg_temp.try_move(p_who text, p_task uuid, p_to public.task_status, p_comment text default null)
returns text
language plpgsql as $$
begin
  if p_who = 'anon' then
    perform pg_temp.login_anon();
  else
    perform pg_temp.login(p_who);
  end if;
  perform public.change_task_status(p_task, p_to, p_comment);
  perform pg_temp.logout();
  return 'ok';
exception when others then
  return sqlstate;
end
$$;

-- Полная матрица: 5 статусов × 5 статусов × 5 действующих лиц = 125 проверок.
-- Правило записано здесь отдельно от кода функции. Каждая проверка смотрит код ответа, статус после и число новых событий.
create function pg_temp.matrix()
returns setof text
language plpgsql as $$
declare
  v_who record;
  v_from public.task_status;
  v_to public.task_status;
  v_task uuid;
  v_rule text;
  v_expected text;
  v_got text;
  v_status public.task_status;
  v_events integer;
begin
  for v_who in
    select * from (values
      ('boss', 'task-a', true, false),   -- постановщик, задача чужая
      ('boss', 'task-self', true, true), -- постановщик, назначен исполнителем
      ('w1', 'task-a', false, true),     -- назначенный исполнитель
      ('w2', 'task-a', false, false),    -- чужой исполнитель
      ('anon', 'task-a', false, false)
    ) as w (who, task, is_manager, is_assignee)
  loop
    v_task := pg_temp.id(v_who.task);
    foreach v_from in array enum_range(null::public.task_status) loop
      foreach v_to in array enum_range(null::public.task_status) loop
        update public.tasks set status = v_from where id = v_task;
        select count(*) into v_events from public.task_events where task_id = v_task;

        v_rule := case v_from::text || '>' || v_to::text
          when 'new>work' then 'assignee'
          when 'work>review' then 'assignee'
          when 'rework>work' then 'assignee'
          when 'review>accepted' then 'manager'
          when 'review>rework' then 'manager'
        end;
        v_expected := case
          when v_who.who = 'anon' then '42501'
          when not v_who.is_manager and not v_who.is_assignee then 'P0002'
          when v_rule is null then 'P0001'
          when v_rule = 'assignee' and v_who.is_assignee then 'ok'
          when v_rule = 'manager' and v_who.is_manager then 'ok'
          else '42501'
        end;

        v_got := pg_temp.try_move(v_who.who, v_task, v_to, 'причина');
        select status into v_status from public.tasks where id = v_task;
        select count(*) - v_events into v_events from public.task_events where task_id = v_task;

        return next is(
          format('%s, %s, %s событий', v_got, v_status, v_events),
          format('%s, %s, %s событий', v_expected, case when v_expected = 'ok' then v_to else v_from end, case when v_expected = 'ok' then 1 else 0 end),
          format('%s (%s): %s -> %s', v_who.who, v_who.task, v_from, v_to)
        );
      end loop;
    end loop;
  end loop;
end
$$;

select * from pg_temp.matrix();

-- Тексты ошибок договорённости: их показывает сайт.
update public.tasks set status = 'review' where id = pg_temp.id('task-a');

select pg_temp.login('boss');
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-a'), 'work') $$,
  'P0001', 'Так нельзя: из «На проверке» задача идёт только в «Принята» или «На доработке».',
  'запрещённый переход: текст договорённости'
);
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-a'), null) $$,
  'P0001', 'Так нельзя: из «На проверке» задача идёт только в «Принята» или «На доработке».',
  'пустой целевой статус отклонён'
);
select throws_ok(
  $$ select public.change_task_status(gen_random_uuid(), 'work') $$,
  'P0002', 'Задача не найдена', 'несуществующая задача'
);
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-free'), 'work') $$,
  '42501', 'Это может сделать только назначенный исполнитель',
  'задачу без исполнителя не взять, пока постановщик себя не назначил'
);
select throws_ok(
  format($$ select public.change_task_status(%L, 'rework', %L) $$, pg_temp.id('task-a'), repeat('я', 2001)),
  '23514', 'Комментарий: не больше 2000 знаков.', 'слишком длинный комментарий'
);

-- Комментарий при возврате обязателен: пусто, пробелы, NULL.
select throws_ok(
  format('select public.change_task_status(%L, %L, %L)', pg_temp.id('task-a'), 'rework', c),
  '23514', 'Напишите, что нужно исправить: без комментария вернуть нельзя.',
  'возврат без комментария: ' || label
)
from (values (null, 'NULL'), ('', 'пустая строка'), ('   ', 'пробелы'), (E'\n\t ', 'переводы строк и табуляция')) as v (c, label);

select pg_temp.logout();
select is(
  (select status from public.tasks where id = pg_temp.id('task-a')), 'review'::public.task_status,
  'после отказов статус не изменился'
);

-- Чужой и назначенный при отказе получают разные тексты.
select pg_temp.login('w1');
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-a'), 'accepted') $$,
  '42501', 'Это действие доступно постановщику', 'исполнитель не принимает: текст договорённости'
);
select pg_temp.login('w2');
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-a'), 'accepted') $$,
  'P0002', 'Задача не найдена', 'чужой исполнитель не узнаёт, что задача существует'
);
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-free'), 'work') $$,
  'P0002', 'Задача не найдена', 'исполнитель не видит задачу без исполнителя'
);

-- Вошедший без профиля не имеет никаких прав.
select pg_temp.login('ghost');
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-a'), 'accepted') $$,
  'P0002', 'Задача не найдена', 'пользователь без профиля'
);

-- Роль только из profiles: подделанные метаданные в токене не помогают.
select pg_temp.login('w1', '{"user_metadata": {"role": "manager"}, "app_metadata": {"role": "manager"}}');
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-a'), 'accepted') $$,
  '42501', 'Это действие доступно постановщику', 'роль из метаданных токена не считается'
);

select pg_temp.logout();
update public.tasks set status = 'accepted' where id = pg_temp.id('task-a');
select pg_temp.login('boss');
select throws_ok(
  $$ select public.change_task_status(pg_temp.id('task-a'), 'work') $$,
  'P0001', 'Так нельзя: принятая задача больше не меняет статус.', 'из «Принята» перехода нет'
);

-- Полный путь со вторым кругом: событие хранит кто, когда, откуда, куда и комментарий.
select pg_temp.logout();
update public.tasks set status = 'review' where id = pg_temp.id('task-b');

select pg_temp.login('boss2');
select is(
  (public.change_task_status(pg_temp.id('task-b'), 'rework', '  Проверьте углы  ')).status, 'rework'::public.task_status,
  'любой постановщик возвращает, функция отдаёт новую строку задачи'
);
select results_eq(
  $$ select actor_id, from_status::text, to_status::text, comment, field::text, created_at
     from public.task_events
     where task_id = pg_temp.id('task-b') and kind = 'status' $$,
  $$ values (pg_temp.id('boss2'), 'review', 'rework', 'Проверьте углы', null::text, now()) $$,
  'событие возврата: кто, откуда, куда, комментарий без крайних пробелов, время базы'
);

select pg_temp.login('w2');
select is(
  (public.change_task_status(pg_temp.id('task-b'), 'work')).status, 'work'::public.task_status,
  'исполнитель берёт задачу снова'
);
select is(
  (public.change_task_status(pg_temp.id('task-b'), 'review', 'Исправил')).status, 'review'::public.task_status,
  'исполнитель отправляет на проверку с необязательным комментарием'
);
select is(
  (select comment from public.task_events where task_id = pg_temp.id('task-b') and to_status = 'review' order by id desc limit 1),
  'Исправил', 'необязательный комментарий сохранён'
);

select pg_temp.login('boss');
select is(
  (public.change_task_status(pg_temp.id('task-b'), 'accepted')).status, 'accepted'::public.task_status,
  'другой постановщик принимает'
);
select is(
  (select comment from public.task_events where task_id = pg_temp.id('task-b') and to_status = 'accepted'),
  null, 'пустой комментарий хранится как NULL'
);

-- Постановщик назначает себя, выполняет и принимает сам (AC-15).
select pg_temp.login('boss');
update public.tasks set assignee_id = pg_temp.id('boss') where id = pg_temp.id('task-free');
select is((public.change_task_status(pg_temp.id('task-free'), 'work')).status, 'work'::public.task_status, 'постановщик взял свою задачу');
select is((public.change_task_status(pg_temp.id('task-free'), 'review')).status, 'review'::public.task_status, 'постановщик отправил свою задачу на проверку');
select is((public.change_task_status(pg_temp.id('task-free'), 'accepted')).status, 'accepted'::public.task_status, 'постановщик принял свою задачу');

select * from finish();
rollback;
