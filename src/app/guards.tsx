import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';
import { LoginPage } from '@/features/auth';
import { MeProvider, signOut, useCurrentProfile, useMe, useSession } from '@/shared/api';
import { paths } from '@/shared/lib';
import { ErrorState, LoadingState } from '@/shared/ui';

function Screen({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}

/** Защита адресов: без сессии всё ведёт на вход. Показ ничего не защищает, данные защищает RLS. */
export function RequireAuth() {
  const session = useSession();
  const profile = useCurrentProfile();

  if (session.status === 'guest') return <Navigate to={paths.login} replace />;
  if (session.status === 'loading' || profile.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  // isError истинно и при сбое фонового обновления: уже загруженный профиль не должен снимать весь сайт.
  if (!profile.data && profile.isError) {
    return (
      <Screen>
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }
  // Пользователь есть, профиля нет: роль неизвестна, поэтому дальше не пускаем.
  if (!profile.data) {
    return (
      <Screen>
        <div className="tile empty w" role="alert">
          <h2 className="tile-h">Профиль не найден</h2>
          <p>Для этого пользователя не заведён профиль. Обратитесь к администратору.</p>
          <button className="btn is-primary" type="button" onClick={() => void signOut()}>
            Выйти
          </button>
        </div>
      </Screen>
    );
  }
  return (
    <MeProvider profile={profile.data}>
      <Outlet />
    </MeProvider>
  );
}

/** Экран входа только для тех, кто ещё не вошёл. */
export function GuestOnly() {
  const session = useSession();
  if (session.status === 'ready') return <Navigate to="/" replace />;
  if (session.status === 'loading') {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  return <LoginPage />;
}

/** Исполнитель после входа попадает на /my, постановщик на /objects. */
export function HomeRedirect() {
  const me = useMe();
  return <Navigate to={me.isManager ? paths.objects : paths.my} replace />;
}
