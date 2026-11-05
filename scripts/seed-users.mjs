// Создаёт или обновляет трёх демо-пользователей и их профили. Запускать один раз перед supabase/demo-data.sql.
// Значения только из окружения: SUPABASE_URL, SUPABASE_SECRET_KEY, DEMO_PASSWORD. В вывод они не попадают.
import { createClient } from '@supabase/supabase-js';

const USERS = [
  { email: 'anna@stroyka.test', full_name: 'Анна Смирнова', role: 'manager' },
  { email: 'petr@stroyka.test', full_name: 'Пётр Иванов', role: 'worker' },
  { email: 'sergey@stroyka.test', full_name: 'Сергей Козлов', role: 'worker' },
];

const NAMES = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DEMO_PASSWORD'];
const missing = NAMES.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Не заданы переменные: ${missing.join(', ')}`);
  process.exit(1);
}

// Сообщение сервера или сети может содержать адрес: вырезаем значения перед печатью.
function fail(step, error) {
  const text = NAMES.reduce((message, name) => message.replaceAll(process.env[name], `<${name}>`), String(error.message));
  console.error(`${step}: ${text}`);
  process.exit(1);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// shortcut: читает только первую страницу (1000), этого хватает отдельному проекту с тремя демо-пользователями.
const { data: page, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) fail('Список пользователей', listError);

for (const { email, full_name, role } of USERS) {
  const existing = page.users.find((user) => user.email === email);
  const attributes = { email, password: process.env.DEMO_PASSWORD, email_confirm: true };
  const { data, error } = existing
    ? await admin.auth.admin.updateUserById(existing.id, attributes)
    : await admin.auth.admin.createUser(attributes);
  if (error) fail(email, error);

  // Роль только в таблице profiles, не в метаданных пользователя.
  const { error: profileError } = await admin.from('profiles').upsert({ id: data.user.id, full_name, role });
  if (profileError) fail(`${email}, профиль`, profileError);

  console.log(`${email}: ${existing ? 'обновлён' : 'создан'}`);
}
