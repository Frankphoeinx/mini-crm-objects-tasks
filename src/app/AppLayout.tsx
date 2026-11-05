import { useState, ViewTransition } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { signOut, useMe, useMyTurnCount } from '@/shared/api';
import { paths } from '@/shared/lib';
import { Icon, useToast } from '@/shared/ui';
import { activeTab, isWidePage } from './layoutState';

export function AppLayout() {
  const me = useMe();
  const turn = useMyTurnCount();
  const location = useLocation();
  const navigate = useNavigate();
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
          <button
            className={tab === 'objects' ? 'tab is-active' : 'tab'}
            type="button"
            aria-current={tab === 'objects' ? 'page' : undefined}
            onClick={() => navigate(paths.objects)}
          >
            Объекты
          </button>
          <button
            className={tab === 'my' ? 'tab is-active' : 'tab'}
            type="button"
            aria-current={tab === 'my' ? 'page' : undefined}
            onClick={() => navigate(paths.my)}
          >
            Мои задачи
            {turn > 0 && (
              <span className="tab-n" aria-label={`ждут вашего действия: ${turn}`}>
                {turn}
              </span>
            )}
          </button>
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
        <main className="page-main">
          <Outlet />
        </main>
      </ViewTransition>
    </div>
  );
}
