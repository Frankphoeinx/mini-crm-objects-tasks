-- Демо-пользователей нельзя закрыть от остальных сменой пароля или почты.
begin;
select plan(6);

insert into auth.users (id, email, encrypted_password)
values ('00000000-0000-0000-0000-00000000f001', 'other@stroyka.test', 'hash');

select lives_ok(
  $$update auth.users set encrypted_password = 'первый' where email = 'anna@stroyka.test'$$,
  'первый пароль задать можно'
);
select throws_ok(
  $$update auth.users set encrypted_password = 'второй' where email = 'anna@stroyka.test'$$,
  '42501', 'Пароль и почту демо-пользователя менять нельзя.',
  'заданный пароль сменить нельзя'
);
select throws_ok(
  $$update auth.users set email = 'hacker@example.com' where email = 'petr@stroyka.test'$$,
  '42501', 'Пароль и почту демо-пользователя менять нельзя.',
  'почту сменить нельзя'
);
select lives_ok(
  $$update auth.users set last_sign_in_at = now() where email = 'anna@stroyka.test'$$,
  'вход пишет своё время без помех'
);
select lives_ok(
  $$update auth.users set encrypted_password = 'новый', email = 'other2@stroyka.test' where email = 'other@stroyka.test'$$,
  'другого пользователя правило не трогает'
);
select is(
  (select encrypted_password from auth.users where email = 'anna@stroyka.test'),
  'первый',
  'пароль остался прежним'
);

select * from finish();
rollback;
