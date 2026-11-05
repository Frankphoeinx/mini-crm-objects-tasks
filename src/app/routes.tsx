import { Link, Outlet, ScrollRestoration, useParams, type RouteObject } from 'react-router';
import { MyTasksPage, ObjectBoard } from '@/features/board';
import { ObjectPage, ObjectsPage } from '@/features/objects';
import { ReviewPage } from '@/features/review';
import { TaskPage } from '@/features/task';
import { paths } from '@/shared/lib';
import { NotFoundState } from '@/shared/ui';
import { AppLayout } from './AppLayout';
import { CrashScreen } from './CrashScreen';
import { GuestOnly, HomeRedirect, RequireAuth } from './guards';

function ObjectRoute() {
  const { id = '' } = useParams();
  return <ObjectPage key={id} objectId={id} board={<ObjectBoard objectId={id} />} />;
}

function TaskRoute() {
  const { id = '' } = useParams();
  return <TaskPage key={id} taskId={id} />;
}

function NotFoundRoute() {
  return (
    <NotFoundState
      action={
        <Link className="btn is-primary" to={paths.objects}>
          К объектам
        </Link>
      }
    />
  );
}

function RootRoute() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const routes: RouteObject[] = [
  {
    element: <RootRoute />,
    errorElement: <CrashScreen />,
    children: [
      { path: paths.login, element: <GuestOnly /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomeRedirect /> },
              { path: paths.objects, element: <ObjectsPage /> },
              { path: paths.object(':id'), element: <ObjectRoute /> },
              { path: paths.task(':id'), element: <TaskRoute /> },
              { path: paths.my, element: <MyTasksPage /> },
              { path: paths.review, element: <ReviewPage /> },
              { path: '*', element: <NotFoundRoute /> },
            ],
          },
        ],
      },
    ],
  },
];
