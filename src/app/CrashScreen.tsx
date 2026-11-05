import { ErrorState } from '@/shared/ui';

/** Неожиданная ошибка при показе экрана: вместо белой страницы понятный текст и перезагрузка. */
export function CrashScreen() {
  return (
    <div className="page">
      <ErrorState error={null} title="Экран не открылся" onRetry={() => window.location.reload()} />
    </div>
  );
}
