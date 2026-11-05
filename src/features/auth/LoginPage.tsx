import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { INVALID_CREDENTIALS_ERROR, signIn } from '@/shared/api';
import { Crane, Icon, type IconName } from '@/shared/ui';

const DEMO_ACCOUNTS: { email: string; name: string; roleLabel: string; icon: IconName }[] = [
  { email: 'anna@stroyka.test', name: 'Анна Смирнова', roleLabel: 'Постановщик', icon: 'crane' },
  { email: 'petr@stroyka.test', name: 'Пётр Иванов', roleLabel: 'Исполнитель', icon: 'work' },
  { email: 'sergey@stroyka.test', name: 'Сергей Козлов', roleLabel: 'Исполнитель', icon: 'work' },
];

const STEPS: { icon: IconName; title: string; text: string; delay: string }[] = [
  { icon: 'new', title: 'Новая', text: 'Постановщик ставит задачу', delay: '120ms' },
  { icon: 'work', title: 'В работе', text: 'Исполнитель берёт её в работу', delay: '220ms' },
  { icon: 'review', title: 'На проверке', text: 'Исполнитель сдаёт результат', delay: '320ms' },
  { icon: 'accepted', title: 'Принята', text: 'Постановщик принимает или возвращает на доработку', delay: '420ms' },
];

const ERROR_ID = 'bs-login-err';
const delay = (d: string) => ({ '--d': d }) as CSSProperties;

export function LoginPage() {
  const demoPassword = import.meta.env.VITE_DEMO_PASSWORD;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // После успеха отправка не сбрасывается: экран сменится, когда придёт сессия.
  async function enter(mail: string, pass: string) {
    setPending(true);
    setError('');
    const message = await signIn(mail, pass);
    if (!message) return;
    setPending(false);
    setError(demoPassword && message === INVALID_CREDENTIALS_ERROR ? `${message} Выберите пользователя ниже.` : message);
    (mail ? passwordRef : emailRef).current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Введите почту и пароль.');
      (email.trim() ? passwordRef : emailRef).current?.focus();
      return;
    }
    void enter(email, password);
  }

  const invalid = error ? { 'aria-invalid': true, 'aria-describedby': ERROR_ID } : {};

  return (
    <main className="login">
      <section className="tile t-crane l-crane w">
        <Crane withBuilding />
        <h1 className="l-h">
          Объекты
          <br />и задачи
        </h1>
      </section>

      <div className="l-side">
        <form className="tile l-form" onSubmit={submit} noValidate>
          <h2 className="l-form-h">Вход</h2>
          <div className="field">
            <label htmlFor="bs-mail">Почта</label>
            <input
              id="bs-mail"
              ref={emailRef}
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              {...invalid}
            />
          </div>
          <div className="field">
            <label htmlFor="bs-pass">Пароль</label>
            <input
              id="bs-pass"
              ref={passwordRef}
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              {...invalid}
            />
          </div>
          {error && (
            <p id={ERROR_ID} className="err" role="alert">
              {error}
            </p>
          )}
          <button className="btn is-primary is-big" type="submit" disabled={pending}>
            {pending ? 'Входим…' : 'Войти'}
          </button>
          <p className="l-hint">Регистрации нет: пользователей заводит администратор.</p>
        </form>
        {demoPassword && (
          <section className="tile l-demo w" style={delay('40ms')}>
            <h3 className="tile-h">Демо-пользователи</h3>
            <p className="l-hint">Нажмите, и вход выполнится сразу.</p>
            <div className="acc-list">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className={email === account.email ? 'acc is-selected' : 'acc'}
                  disabled={pending}
                  onClick={() => {
                    setEmail(account.email);
                    void enter(account.email, demoPassword);
                  }}
                >
                  <Icon name={account.icon} />
                  <span className="acc-t">
                    <b>{account.name}</b> <small>{account.roleLabel}</small>
                  </span>
                  <Icon name="accepted" className="acc-ok" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="tile t-orange l-steps w" style={delay('70ms')} aria-labelledby="bs-steps">
        <h2 className="tile-h" id="bs-steps">
          Как идёт задача
        </h2>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step.title} className="step" style={delay(step.delay)}>
              <span className="step-ic">
                <Icon name={step.icon} />
              </span>
              <b>{step.title}</b>
              <small>{step.text}</small>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
