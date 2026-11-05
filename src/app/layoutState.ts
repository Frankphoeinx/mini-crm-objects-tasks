import { readTaskFrom } from '@/shared/lib';

export type Tab = 'objects' | 'my';

/** Вкладка подсвечена и на вложенных экранах: задача, открытая из «Моих задач», остаётся в них. */
export function activeTab(pathname: string, state: unknown): Tab {
  if (pathname === '/my') return 'my';
  if (pathname.startsWith('/tasks/') && readTaskFrom(state) === 'my') return 'my';
  return 'objects';
}

/** Экраны с доской и проверкой занимают всё окно. */
export function isWidePage(pathname: string) {
  return pathname === '/my' || pathname === '/review' || pathname.startsWith('/objects/');
}
