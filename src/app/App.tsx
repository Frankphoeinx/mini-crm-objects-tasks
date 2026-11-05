import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import type { DataRouter } from 'react-router';
import { SessionProvider, useSession } from '@/shared/api';
import { IconDefs, PORTAL_ROOT_ID, UndoProvider, useMoveFlash } from '@/shared/ui';

function Frame({ router }: { router: DataRouter }) {
  const { to } = useMoveFlash();
  return (
    <div id={PORTAL_ROOT_ID} className={to ? `bs flash-${to}` : 'bs'}>
      <IconDefs />
      <RouterProvider router={router} />
    </div>
  );
}

// key: при смене пользователя окно отмены прошлого пользователя закрывается, его действие не уйдёт в базу.
function Session({ router }: { router: DataRouter }) {
  const { userId } = useSession();
  return (
    <UndoProvider key={userId ?? 'guest'}>
      <Frame router={router} />
    </UndoProvider>
  );
}

export function App({ queryClient, router }: { queryClient: QueryClient; router: DataRouter }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Session router={router} />
      </SessionProvider>
    </QueryClientProvider>
  );
}
