import { useEffect, useEffectEvent } from 'react';

/** Браузер предупредит при закрытии вкладки и перезагрузке, если isDirty() скажет, что есть несохранённое. */
export function useLeaveGuard(isDirty: () => boolean) {
  const warn = useEffectEvent((e: BeforeUnloadEvent) => {
    if (isDirty()) e.preventDefault();
  });
  useEffect(() => {
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
}
