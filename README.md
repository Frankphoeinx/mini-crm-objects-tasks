# Объекты и задачи

Мини-CRM для строительной компании: постановщик ставит задачи по стройкам, исполнители выполняют их и отдают на проверку. Тестовое задание 2B Studio.

Права проверяет сама база данных, поэтому правила работают и для запросов мимо сайта.

## Где посмотреть

Адрес сайта и демо-доступы передаются вместе со сдачей задания.

## Стек

- Сайт: React 19, TypeScript 6, Vite 8, React Router 8, TanStack Query 5. Библиотеки интерфейса нет, стили свои.
- База и вход: Supabase, PostgreSQL 17, RLS (правила доступа к строкам таблиц внутри самой базы), клиент `@supabase/supabase-js`.
- Тесты: pgTAP для базы, Vitest и Testing Library для сайта. Линтер ESLint.
- Выкладка: Vercel.

## Как запустить локально

Нужны Node.js 24 и Docker. Supabase CLI отдельно ставить не надо: `npx supabase` скачает его при первом вызове. Работа шла на версии 3.0.0.

Сначала установите зависимости и создайте файл настроек:

```bash
npm install
cp .env.example .env.local
```

Заполните в `.env.local` адрес и публичный ключ Supabase. Сайту нужны вход и API Supabase, одного контейнера базы мало. Есть два пути:

- Облачный проект Supabase. Подготовка описана в разделе «Миграции и демо-данные», адрес и публичный ключ берутся из настроек проекта.
- Все сервисы Supabase локально: `npx supabase start`. Команда требует много памяти, пароли пользователям затем задаёт `scripts/seed-users.mjs`. В этой работе этот путь не прогоняли.

Затем запустите сайт:

```bash
npm run dev
```

Сайт откроется на `http://localhost:5173`. Если в `.env.local` нет `VITE_SUPABASE_URL` или `VITE_SUPABASE_PUBLISHABLE_KEY`, сайт не запустится и назовёт эти переменные.

## Миграции и демо-данные

Миграции лежат в `supabase/migrations`:

| Файл | Что создаёт |
|---|---|
| `20261105120000_profiles.sql` | схема `private`, роли, профили |
| `20261105120100_objects_and_tasks.sql` | объекты, задачи, права, RLS, триггеры записи |
| `20261105120200_task_events.sql` | история, её неизменность, вид `task_board` |
| `20261105120300_task_functions.sql` | смена статуса и удаление |
| `20261105120400_lock_demo_users.sql` | запрет менять пароль и почту демо-пользователей |

Локальная база, только контейнер, без входа и API:

```bash
npx supabase db start
npx supabase db reset
```

`db reset` создаёт базу заново: миграции, `supabase/seed.sql` (три пользователя без пароля), `supabase/demo-data.sql` (объекты, задачи, история). Новую миграцию на запущенной базе применяет `npx supabase migration up`.

Облачный проект, порядок шагов обязателен:

```bash
npx supabase login
npx supabase link --project-ref <ref-проекта>
npx supabase db push --remote --yes
SUPABASE_URL=... SUPABASE_SECRET_KEY=... DEMO_PASSWORD=... node scripts/seed-users.mjs
npx supabase db query --remote --yes --file supabase/demo-data.sql
npx supabase config push --yes
```

Команды проверены на Supabase CLI 3.0.0. Что делает каждая:

1. `db push` применяет миграции к облачному проекту. Без `--remote` команда пойдёт в локальную базу. Флаг `--include-seed` не нужен: `seed.sql` вставляет записи в `auth.users`, на облачной базе его запускать нельзя.
2. `seed-users.mjs` создаёт трёх пользователей и их профили. Повторный запуск обновит профили, заданный пароль останется прежним: сменить его можно только новой миграцией, которая снимает запрет.
3. `db query` загружает демо-данные. Повторный запуск ничего не меняет.
4. `config push` закрывает регистрацию: `[auth] enable_signup = false` из `supabase/config.toml` миграциями не применяется.

## Тесты и проверки

Сайт:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

База, нужен запущенный контейнер:

```bash
npx supabase db reset
npx supabase test db
npx supabase db lint --fail-on warning
```

В тестах базы 357 проверок. Что они доказывают, написано в [docs/04-baza.md](docs/04-baza.md).

## Переменные окружения

Здесь только имена. Образец без значений лежит в `.env.example`, файлы `.env` и `.env.*` закрыты в `.gitignore`.

| Имя | Кто читает | Что это |
|---|---|---|
| `VITE_SUPABASE_URL` | сайт | адрес проекта Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | сайт | публичный ключ Supabase |
| `VITE_DEMO_PASSWORD` | сайт | общий пароль демо-пользователей, попадает в код страницы; пусто значит блока демо-входа нет |
| `SUPABASE_URL` | `scripts/seed-users.mjs` | адрес проекта Supabase |
| `SUPABASE_SECRET_KEY` | `scripts/seed-users.mjs` | секретный ключ, на сайт он не попадает |
| `DEMO_PASSWORD` | `scripts/seed-users.mjs` | пароль, который получат демо-пользователи |

## Откат

- Сайт: `vercel rollback <адрес выкладки>`. Смена переменных `VITE_*` требует новой сборки.
- База: новая миграция вперёд. Откат миграций стирает данные и историю, поэтому без резервной копии его не делаем.
- Запрет менять пароль демо-пользователей снимает `drop trigger demo_users_locked on auth.users`, данные это не затрагивает.

## Что где лежит

| Папка | Что в ней |
|---|---|
| `src/app` | каркас сайта: адреса, защита адресов, шапка |
| `src/features` | экраны: вход, объекты, доска, мои задачи, проверка, задача |
| `src/shared` | общее: запросы к базе, компоненты, стили |
| `supabase/migrations` | устройство базы |
| `supabase/tests` | тесты базы |
| `scripts` | создание демо-пользователей |
| `docs` | документация |

## Куда смотреть дальше

- [docs/01-kak-eto-rabotaet.md](docs/01-kak-eto-rabotaet.md): объяснение для руководителя без терминов.
- [docs/02-karta-sayta.md](docs/02-karta-sayta.md): экраны и адреса, что видит каждая роль.
- [docs/03-zashchita-dannyh.md](docs/03-zashchita-dannyh.md): что не может исполнитель и как это устроено в базе.
- [docs/04-baza.md](docs/04-baza.md): таблицы, функции, ошибки, тесты.
- [docs/05-resheniya-i-dopushcheniya.md](docs/05-resheniya-i-dopushcheniya.md): решения и допущения, что не делали и что не успели.
