import { useEffect, useRef, useState, ViewTransition } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { signOut, useMe, useMyTurnCount } from '@/shared/api';
import { paths } from '@/shared/lib';
import { Icon } from '@/shared/ui';
import { useToast } from '@/shared/undo';
import { activeTab, isWidePage } from './layoutState';

export function AppLayout() {
  const me = useMe();
  const turn = useMyTurnCount();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const shownPath = useRef(location.pathname);

  // Кнопка, по которой ушли со страницы (удаление, смена экрана), исчезла: клавиатура продолжает с начала нового экрана, а не с начала сайта.
  useEffect(() => {
    if (shownPath.current === location.pathname) return;
    shownPath.current = location.pathname;
    if (document.activeElement === document.body) mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  const { showToast } = useToast();
  const [leaving, setLeaving] = useState(false);
  const tab = activeTab(location.pathname, location.state);

  async function logout() {
    setLeaving(true);
    // Успех приходит через смену сессии: защита адресов сама уведёт на вход.
    if (!(await signOut())) {
      setLeaving(false);
      showToast('Не получилось выйти: нет связи с сервером. Попробуйте ещё раз.');
    }
  }

  return (
    <div className={isWidePage(location.pathname) ? 'page is-wide' : 'page'}>
      <header className="top">
        <div className="tile brand">
          <span className="brand-mark">
            <Icon name="crane" />
          </span>
          Объекты и задачи
        </div>
        <nav className="tile tabs" aria-label="Разделы">
          <span className="tabs-thumb" style={{ transform: `translateX(${tab === 'my' ? '100%' : '0%'})` }} aria-hidden="true"></span>
          <Link className={tab === 'objects' ? 'tab is-active' : 'tab'} to={paths.objects} aria-current={tab === 'objects' ? 'page' : undefined}>
            Объекты
          </Link>
          <Link className={tab === 'my' ? 'tab is-active' : 'tab'} to={paths.my} aria-current={tab === 'my' ? 'page' : undefined}>
            Мои задачи
            {turn > 0 && (
              <span className="tab-n" aria-label={`ждут вашего действия: ${turn}`}>
                {turn}
              </span>
            )}
          </Link>
        </nav>
        <div className="tile user">
          <span className="ava" aria-hidden="true">
            {me.initials}
          </span>
          <span className="u-txt">
            <b>{me.full_name}</b>
            <small>{me.roleLabel}</small>
          </span>
          <button className="btn is-soft" type="button" disabled={leaving} onClick={() => void logout()}>
            Выйти
          </button>
        </div>
      </header>
      <ViewTransition default="bs-page">
        <main className="page-main" ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </ViewTransition>
    </div>
  );
}
