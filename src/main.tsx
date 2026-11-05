import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App } from '@/app/App';
import { routes } from '@/app/routes';
import { createQueryClient } from '@/shared/api';
import '@/shared/styles/bento.css';
import '@/shared/styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Нет элемента #root');

createRoot(root).render(
  <StrictMode>
    <App queryClient={createQueryClient()} router={createBrowserRouter(routes)} />
  </StrictMode>,
);
