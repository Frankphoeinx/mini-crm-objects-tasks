import { useEffect } from 'react';

const SITE = 'Объекты и задачи';

/** Заголовок вкладки: своё имя у каждого экрана, чтобы различать вкладки и слышать смену экрана в дикторе. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${SITE}`;
  }, [title]);
}
